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
    /// onto the Unity main thread in Update(), and exposes the latest snapshot plus event/error
    /// callbacks. Sending is fire-and-forget (optimistic) — the server validates and may reply Error.
    ///
    /// NOTE: System.Net.WebSockets.ClientWebSocket is unsupported on WebGL; this is desktop/editor only
    /// for now. A WebGL transport would swap in the browser WebSocket via jslib later.
    /// </summary>
    public sealed class MetaDeckNetClientMB : MonoBehaviour
    {
        [Header("Connection")]
        [SerializeField] private string serverUrl = "ws://localhost:8123/";
        [SerializeField] private bool connectOnStart = true;

        /// <summary>Which side the server assigned this client (valid after OnWelcome).</summary>
        public PlayerId LocalPlayer { get; private set; }
        public SnapshotDto LatestSnapshot { get; private set; }
        public bool IsConnected => _ws != null && _ws.State == WebSocketState.Open;

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
            _ws = new ClientWebSocket();
            try
            {
                await _ws.ConnectAsync(new Uri(serverUrl), _cts.Token);
                _ = ReceiveLoop(_cts.Token);
                Debug.Log($"[Net] Connected to {serverUrl}");
            }
            catch (Exception ex)
            {
                Debug.LogError($"[Net] Connect failed: {ex.Message}");
                _ws = null;
            }
        }

        /// <summary>Send a command to the server (fire-and-forget; server is authoritative).</summary>
        public async void Send(CommandDto dto)
        {
            if (!IsConnected) { Debug.LogWarning("[Net] Not connected; command dropped."); return; }

            var bytes = Encoding.UTF8.GetBytes(ProtocolJson.Serialize(dto));
            await _sendLock.WaitAsync();
            try
            {
                await _ws.SendAsync(new ArraySegment<byte>(bytes), WebSocketMessageType.Text, true, _cts.Token);
            }
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
                    if (msg != null) _inbox.Enqueue(msg); // dispatched on main thread in Update()
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
                    Debug.LogWarning($"[Net] Server rejected command: {msg.Error}");
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
