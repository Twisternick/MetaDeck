using System;
using System.Collections.Generic;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Server
{
    /// <summary>
    /// In-process end-to-end test: starts the server, then exercises the lobby (Quick Match and
    /// private rooms by code) and the authoritative match loop (hidden-info snapshots, a legal turn
    /// change, and rejection of an out-of-turn command).
    /// </summary>
    public static class SelfTest
    {
        public static async Task<int> Run()
        {
            int failures = 0;
            void Check(string name, bool ok, string detail = null)
            {
                Console.WriteLine($"  [{(ok ? "PASS" : "FAIL")}] {name}{(!ok && detail != null ? " — " + detail : "")}");
                if (!ok) failures++;
            }

            const string prefix = "http://localhost:8123/";
            const string url = "ws://localhost:8123/";

            using var cts = new CancellationTokenSource();
            var server = new MatchServer(prefix, CardCatalog.Default());
            var serverTask = server.RunAsync(cts.Token);

            Console.WriteLine("Phase F — lobby + match self-test");

            // --- Quick Match: two players queue and get paired ---
            Console.WriteLine("Quick Match:");
            var a = await Connect(url);
            var b = await Connect(url);
            await SendLobby(a, LobbyRequestKind.QuickMatch);
            await SendLobby(b, LobbyRequestKind.QuickMatch);

            var wa = await RecvUntilKind(a, ServerMessageKind.Welcome);
            var wb = await RecvUntilKind(b, ServerMessageKind.Welcome);
            Check("both queued players matched", wa != null && wb != null);
            Check("assigned distinct sides", wa.AssignedPlayer != wb.AssignedPlayer);

            var p1 = wa.AssignedPlayer == PlayerId.P1 ? a : b;
            var p1Welcome = wa.AssignedPlayer == PlayerId.P1 ? wa : wb;
            Check("initial active = P1, turn 1", p1Welcome.Snapshot.ActivePlayer == PlayerId.P1 && p1Welcome.Snapshot.TurnNumber == 1);
            Check("P2 hand hidden from P1", p1Welcome.Snapshot.Players[1].Hand.Count == 0 && p1Welcome.Snapshot.Players[1].HandCount == 3);

            await Send(p1, new CommandDto { Kind = CommandKind.EndTurn });
            var (events, snap) = await DrainUntilSnapshot(p1);
            Check("turn change broadcast", events.Contains(EventKind.TurnEnded) && events.Contains(EventKind.TurnStarted));
            Check("active flips to P2, turn 2", snap != null && snap.ActivePlayer == PlayerId.P2 && snap.TurnNumber == 2);

            await Send(p1, new CommandDto { Kind = CommandKind.EndTurn });
            Check("out-of-turn command rejected", await RecvUntilKind(p1, ServerMessageKind.Error) != null);

            // --- Private rooms: create + join by code ---
            Console.WriteLine("Rooms:");
            var host = await Connect(url);
            var guest = await Connect(url);

            await SendLobby(host, LobbyRequestKind.CreateRoom);
            var created = await RecvUntilKind(host, ServerMessageKind.RoomCreated);
            Check("room created with a code", created != null && !string.IsNullOrEmpty(created.RoomCode));

            await SendLobby(guest, LobbyRequestKind.JoinRoom, created.RoomCode);
            var wh = await RecvUntilKind(host, ServerMessageKind.Welcome);
            var wg = await RecvUntilKind(guest, ServerMessageKind.Welcome);
            Check("joining the code starts a match", wh != null && wg != null && wh.AssignedPlayer != wg.AssignedPlayer);

            var stray = await Connect(url);
            await SendLobby(stray, LobbyRequestKind.JoinRoom, "ZZZZ");
            Check("joining an unknown room is rejected", await RecvUntilKind(stray, ServerMessageKind.Error) != null);

            // --- Deck selection ---
            Console.WriteLine("Decks:");

            // Custom player-built deck (all 'sniper') -> opening hand is all sniper.
            var customDeck = new string[20];
            for (int i = 0; i < customDeck.Length; i++) customDeck[i] = "sniper";
            var cd1 = await Connect(url);
            var cd2 = await Connect(url);
            await SendLobby(cd1, LobbyRequestKind.QuickMatch, deck: customDeck);
            await SendLobby(cd2, LobbyRequestKind.QuickMatch);
            var custHand = LocalView(await RecvUntilKind(cd1, ServerMessageKind.Welcome)).Hand;
            Check("custom deck used (opening hand all 'sniper')",
                custHand.Count == 3 && custHand.TrueForAll(c => c.CardId == "sniper"));

            // Random selection from the 'Control' archetype -> only bruiser/sniper.
            var ca1 = await Connect(url);
            var ca2 = await Connect(url);
            await SendLobby(ca1, LobbyRequestKind.QuickMatch, archetype: "Control");
            await SendLobby(ca2, LobbyRequestKind.QuickMatch);
            var archHand = LocalView(await RecvUntilKind(ca1, ServerMessageKind.Welcome)).Hand;
            Check("archetype deck used (hand within Control set)",
                archHand.Count == 3 && archHand.TrueForAll(c => c.CardId == "bruiser" || c.CardId == "sniper"));

            cts.Cancel();
            try { await serverTask; } catch { }

            Console.WriteLine();
            Console.WriteLine(failures == 0 ? "ALL CHECKS PASSED" : $"{failures} CHECK(S) FAILED");
            return failures == 0 ? 0 : 1;
        }

        private static async Task<ClientWebSocket> Connect(string url)
        {
            var ws = new ClientWebSocket();
            await ws.ConnectAsync(new Uri(url), CancellationToken.None);
            return ws;
        }

        private static Task SendLobby(ClientWebSocket ws, LobbyRequestKind kind, string code = null,
                                      string[] deck = null, string archetype = null)
            => WsUtil.SendText(ws, ProtocolJson.Serialize(new LobbyRequest
            {
                Kind = kind, RoomCode = code, DeckCardIds = deck, Archetype = archetype
            }), CancellationToken.None);

        private static PlayerViewDto LocalView(ServerMessage welcome)
        {
            foreach (var p in welcome.Snapshot.Players)
                if (p.Id == welcome.AssignedPlayer) return p;
            return null;
        }

        private static Task Send(ClientWebSocket ws, CommandDto dto)
            => WsUtil.SendText(ws, ProtocolJson.Serialize(dto), CancellationToken.None);

        private static async Task<ServerMessage> Recv(ClientWebSocket ws, int timeoutMs = 4000)
        {
            using var cts = new CancellationTokenSource(timeoutMs);
            var text = await WsUtil.ReceiveText(ws, cts.Token);
            return text == null ? null : ProtocolJson.Deserialize<ServerMessage>(text);
        }

        private static async Task<(List<EventKind> events, SnapshotDto snapshot)> DrainUntilSnapshot(ClientWebSocket ws)
        {
            var kinds = new List<EventKind>();
            for (int i = 0; i < 50; i++)
            {
                var m = await Recv(ws);
                if (m == null) break;
                if (m.Kind == ServerMessageKind.Event && m.Event != null) kinds.Add(m.Event.Kind);
                else if (m.Kind == ServerMessageKind.Snapshot) return (kinds, m.Snapshot);
            }
            return (kinds, null);
        }

        private static async Task<ServerMessage> RecvUntilKind(ClientWebSocket ws, ServerMessageKind kind)
        {
            for (int i = 0; i < 50; i++)
            {
                var m = await Recv(ws);
                if (m == null) return null;
                if (m.Kind == kind) return m;
            }
            return null;
        }
    }
}
