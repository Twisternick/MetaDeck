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
    /// Spins up the real WebSocket server in-process, connects two clients, and drives a short
    /// scripted exchange to prove the authoritative loop: pairing, hidden-info snapshots, a legal
    /// turn change broadcast to both, and rejection of an out-of-turn command.
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

            Console.WriteLine("Phase D — authoritative server self-test");

            var a = new ClientWebSocket();
            var b = new ClientWebSocket();
            await a.ConnectAsync(new Uri(url), CancellationToken.None);
            await b.ConnectAsync(new Uri(url), CancellationToken.None);

            var wa = await Recv(a);
            var wb = await Recv(b);
            Check("both clients welcomed", wa?.Kind == ServerMessageKind.Welcome && wb?.Kind == ServerMessageKind.Welcome);
            Check("assigned distinct sides", wa.AssignedPlayer != wb.AssignedPlayer);

            var p1 = wa.AssignedPlayer == PlayerId.P1 ? a : b;
            var p1Welcome = wa.AssignedPlayer == PlayerId.P1 ? wa : wb;

            Check("initial active = P1, turn 1", p1Welcome.Snapshot.ActivePlayer == PlayerId.P1 && p1Welcome.Snapshot.TurnNumber == 1);
            Check("P1 sees own hand (3)", p1Welcome.Snapshot.Players[0].Hand.Count == 3 && p1Welcome.Snapshot.Players[0].HandCount == 3);
            Check("P2 hand hidden from P1 (count only)", p1Welcome.Snapshot.Players[1].Hand.Count == 0 && p1Welcome.Snapshot.Players[1].HandCount == 3);

            // Legal: P1 ends their turn.
            await Send(p1, new CommandDto { Kind = CommandKind.EndTurn });
            var (events, snap) = await DrainUntilSnapshot(p1);
            Check("TurnEnded broadcast", events.Contains(EventKind.TurnEnded));
            Check("TurnStarted broadcast", events.Contains(EventKind.TurnStarted));
            Check("active flips to P2, turn 2", snap != null && snap.ActivePlayer == PlayerId.P2 && snap.TurnNumber == 2);

            // Illegal: P1 tries to end the turn again while it's P2's turn.
            await Send(p1, new CommandDto { Kind = CommandKind.EndTurn });
            var err = await RecvUntilKind(p1, ServerMessageKind.Error);
            Check("out-of-turn command rejected", err != null, "no error received");

            cts.Cancel();
            try { await serverTask; } catch { }

            Console.WriteLine();
            Console.WriteLine(failures == 0 ? "ALL CHECKS PASSED" : $"{failures} CHECK(S) FAILED");
            return failures == 0 ? 0 : 1;
        }

        private static async Task<ServerMessage> Recv(ClientWebSocket ws, int timeoutMs = 4000)
        {
            using var cts = new CancellationTokenSource(timeoutMs);
            var text = await WsUtil.ReceiveText(ws, cts.Token);
            return text == null ? null : ProtocolJson.Deserialize<ServerMessage>(text);
        }

        private static Task Send(ClientWebSocket ws, CommandDto dto)
            => WsUtil.SendText(ws, ProtocolJson.Serialize(dto), CancellationToken.None);

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
