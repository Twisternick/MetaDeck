using System;
using System.Collections.Concurrent;
using System.IO;
using System.Net.WebSockets;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using MetaDeck.Protocol;
using MetaDeck.Rules;
using UnityEngine;

namespace MetaDeck.Unity
{
    /// <summary>
    /// WebSocket client for the authoritative server. Receives on a background task, marshals messages
    /// onto the Unity main thread in Update(), and exposes the latest snapshot plus event/error/lobby
    /// callbacks. After connecting you must enter the lobby (QuickMatch / CreateRoom / JoinRoom) to be
    /// paired into a match; Welcome marks the match start.
    ///
    /// NOTE: ClientWebSocket is unsupported on WebGL; desktop/editor only for now.
    /// </summary>
    public sealed class MetaDeckNetClientMB : MonoBehaviour
    {
        [Header("Connection")]
        [SerializeField] private string serverUrl = "ws://localhost:8123/";
        [SerializeField] private bool connectOnStart = true;
        [Tooltip("Automatically Quick Match after connecting (off if you use a lobby UI for rooms).")]
        [SerializeField] private bool autoQuickMatch = true;

        [Tooltip("How many times to try connecting before giving up.")]
        [SerializeField] private int connectAttempts = 5;
        [Tooltip("Seconds to wait between connection attempts.")]
        [SerializeField] private float retryDelaySeconds = 2f;

        [Header("Deck (set before matching)")]
        [Tooltip("Card ids for a player-built deck. Empty -> server uses the archetype or picks one at random.")]
        public string[] deckCardIds;
        [Tooltip("Preferred archetype for a random deck. Empty -> server picks a random archetype.")]
        public string deckArchetype;

        public PlayerId LocalPlayer { get; private set; }
        public SnapshotDto LatestSnapshot { get; private set; }
        public bool IsConnected => _ws != null && _ws.State == WebSocketState.Open;

        // Lobby
        public event Action<string> OnRoomCreated; // join code
        public event Action OnWaiting;              // queued for a match
        public event Action OnRematchPending;       // you asked for a rematch; waiting on the opponent
        public event Action OnOpponentLeft;         // opponent left/disconnected; you're back in the lobby
        // Match
        public event Action OnWelcome;
        public event Action<SnapshotDto> OnSnapshot;
        public event Action<EventDto> OnEvent;
        public event Action<string> OnError;

        private ClientWebSocket _ws;
        private CancellationTokenSource _cts;
        private readonly ConcurrentQueue<ServerMessage> _inbox = new();
        private readonly SemaphoreSlim _sendLock = new(1, 1);

        private void Start()
        {
            if (connectOnStart) Connect();
        }

        public async void Connect()
        {
            if (_ws != null) return;
            _cts = new CancellationTokenSource();

            int attempts = Mathf.Max(1, connectAttempts);
            for (int attempt = 1; attempt <= attempts; attempt++)
            {
                var ws = new ClientWebSocket();
                try
                {
                    await ws.ConnectAsync(new Uri(serverUrl), _cts.Token);
                    _ws = ws;
                    _ = ReceiveLoop(_cts.Token);
                    Debug.Log($"[Net] Connected to {serverUrl}");
                    if (autoQuickMatch) QuickMatch();
                    return;
                }
                catch (OperationCanceledException) { ws.Dispose(); return; } // shutting down
                catch (Exception ex)
                {
                    ws.Dispose();
                    Debug.LogWarning($"[Net] Connect attempt {attempt}/{attempts} failed: {ex.Message}");
                    if (attempt >= attempts) break;

                    try { await Task.Delay(TimeSpan.FromSeconds(retryDelaySeconds), _cts.Token); }
                    catch (OperationCanceledException) { return; }
                }
            }

            Debug.LogError($"[Net] Could not connect to {serverUrl} after {attempts} attempt(s).");
            OnError?.Invoke("Could not connect to server.");
        }

        // ---- Lobby ---- (each carries the currently-selected deck/archetype)
        public void QuickMatch() => SendLobby(LobbyRequestKind.QuickMatch);
        public void CreateRoom() => SendLobby(LobbyRequestKind.CreateRoom);
        public void JoinRoom(string code) => SendLobby(LobbyRequestKind.JoinRoom, code);
        public void CancelLobby() => SendJson(ProtocolJson.Serialize(new LobbyRequest { Kind = LobbyRequestKind.Cancel }));

        private void SendLobby(LobbyRequestKind kind, string code = null)
            => SendJson(ProtocolJson.Serialize(new LobbyRequest
            {
                Kind = kind,
                RoomCode = code,
                DeckCardIds = (deckCardIds != null && deckCardIds.Length > 0) ? deckCardIds : null,
                Archetype = string.IsNullOrEmpty(deckArchetype) ? null : deckArchetype
            }));

        // ---- In-match commands ----
        public void Send(CommandDto dto) => SendJson(ProtocolJson.Serialize(dto));

        // ---- Match-end controls (after GameOver) ----
        public void Rematch() => Send(new CommandDto { Kind = CommandKind.Rematch });
        public void LeaveMatch() => Send(new CommandDto { Kind = CommandKind.LeaveMatch });

        private async void SendJson(string json)
        {
            if (!IsConnected) { Debug.LogWarning("[Net] Not connected; message dropped."); return; }
            var bytes = Encoding.UTF8.GetBytes(json);
            await _sendLock.WaitAsync();
            try { await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token); }
            catch (Exception ex) { Debug.LogWarning($"[Net] Send failed: {ex.Message}"); }
            finally { _sendLock.Release(); }
        }

        private async Task ReceiveLoop(CancellationToken ct)
        {
            var buffer = new byte[8192];
            using var ms = new MemoryStream();
            try
            {
                while (!ct.IsCancellationRequested && _ws.State == WebSocketState.Open)
                {
                    ms.SetLength(0);
                    WebSocketReceiveResult r;
                    do
                    {
                        r = await _ws.ReceiveAsync(new ArraySegment<byte>(buffer), ct);
                        if (r.MessageType == WebSocketMessageType.Close) return;
                        ms.Write(buffer, 0, r.Count);
                    } while (!r.EndOfMessage);

                    var json = Encoding.UTF8.GetString(ms.GetBuffer(), 0, (int)ms.Length);
                    var msg = ProtocolJson.Deserialize<ServerMessage>(json);
                    if (msg != null) _inbox.Enqueue(msg);
                }
            }
            catch (OperationCanceledException) { }
            catch (Exception ex) { Debug.LogWarning($"[Net] Receive ended: {ex.Message}"); }
        }

        private void Update()
        {
            while (_inbox.TryDequeue(out var msg))
                Dispatch(msg);
        }

        private void Dispatch(ServerMessage msg)
        {
            switch (msg.Kind)
            {
                case ServerMessageKind.RoomCreated:
                    OnRoomCreated?.Invoke(msg.RoomCode);
                    break;
                case ServerMessageKind.Waiting:
                    OnWaiting?.Invoke();
                    break;
                case ServerMessageKind.RematchPending:
                    OnRematchPending?.Invoke();
                    break;
                case ServerMessageKind.OpponentLeft:
                    OnOpponentLeft?.Invoke();
                    break;
                case ServerMessageKind.Welcome:
                    LocalPlayer = msg.AssignedPlayer;
                    LatestSnapshot = msg.Snapshot;
                    OnWelcome?.Invoke();
                    if (msg.Snapshot != null) OnSnapshot?.Invoke(msg.Snapshot);
                    break;
                case ServerMessageKind.Snapshot:
                    LatestSnapshot = msg.Snapshot;
                    OnSnapshot?.Invoke(msg.Snapshot);
                    break;
                case ServerMessageKind.Event:
                    OnEvent?.Invoke(msg.Event);
                    break;
                case ServerMessageKind.Error:
                    OnError?.Invoke(msg.Error);
                    Debug.LogWarning($"[Net] Server: {msg.Error}");
                    break;
            }
        }

        private void OnDestroy() => Shutdown();
        private void OnApplicationQuit() => Shutdown();

        private void Shutdown()
        {
            try { _cts?.Cancel(); } catch { }
            try { _ws?.Dispose(); } catch { }
            _ws = null;
        }
    }
}
