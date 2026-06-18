using System;
using System.Collections.Generic;
using System.Net;
using System.Net.WebSockets;
using System.Threading;
using System.Threading.Tasks;
using MetaDeck.Data;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Server
{
    /// <summary>
    /// WebSocket host. Pairs the first two connections into an authoritative <see cref="ServerMatch"/>,
    /// assigns them P1/P2, and runs the command->validate->submit->broadcast loop. Per-match command
    /// execution is serialized by a gate so the (single-threaded) engine is never touched concurrently.
    /// </summary>
    public sealed class MatchServer
    {
        private readonly HttpListener _listener = new();
        private readonly IReadOnlyList<CardDef> _catalog;
        private readonly int _deckSize, _hp, _hand, _bandwidth;

        private readonly object _pairLock = new();
        private PlayerConn _waiting;
        private TaskCompletionSource<Match> _waitingMatch;

        public MatchServer(string httpPrefix, IReadOnlyList<CardDef> catalog,
                           int deckSize = 20, int hp = 30, int openingHand = 3, int startingBandwidth = 1)
        {
            _listener.Prefixes.Add(httpPrefix);
            _catalog = catalog;
            _deckSize = deckSize; _hp = hp; _hand = openingHand; _bandwidth = startingBandwidth;
        }

        public async Task RunAsync(CancellationToken ct)
        {
            _listener.Start();
            using var reg = ct.Register(() => { try { _listener.Stop(); } catch { } });

            while (!ct.IsCancellationRequested)
            {
                HttpListenerContext ctx;
                try { ctx = await _listener.GetContextAsync(); }
                catch { break; } // listener stopped

                if (!ctx.Request.IsWebSocketRequest)
                {
                    ctx.Response.StatusCode = 400;
                    ctx.Response.Close();
                    continue;
                }

                var wsCtx = await ctx.AcceptWebSocketAsync(null);
                _ = OnConnection(wsCtx.WebSocket, ct);
            }
        }

        private async Task OnConnection(WebSocket ws, CancellationToken ct)
        {
            var conn = new PlayerConn(ws);
            Match match;
            bool iCreated = false;
            TaskCompletionSource<Match> wait = null;

            lock (_pairLock)
            {
                if (_waiting == null)
                {
                    _waiting = conn;
                    _waitingMatch = new TaskCompletionSource<Match>(TaskCreationOptions.RunContinuationsAsynchronously);
                    wait = _waitingMatch;
                    match = null;
                }
                else
                {
                    var p1 = _waiting; var p2 = conn;
                    var pendingTcs = _waitingMatch;
                    _waiting = null; _waitingMatch = null;

                    match = CreateMatch(p1, p2);
                    iCreated = true;
                    pendingTcs.SetResult(match); // wake the waiting (P1) connection
                }
            }

            if (match == null) match = await wait.Task; // P1 waits to be paired

            try
            {
                if (iCreated) await SendWelcome(match, ct); // P2 greets both players once paired
                await RunReceiveLoop(match, conn, ct);
            }
            catch (OperationCanceledException) { }
            finally
            {
                try { await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch { }
            }
        }

        private Match CreateMatch(PlayerConn p1, PlayerConn p2)
        {
            p1.Player = PlayerId.P1;
            p2.Player = PlayerId.P2;
            var game = new ServerMatch(
                CardCatalog.BuildDeck(_catalog, _deckSize),
                CardCatalog.BuildDeck(_catalog, _deckSize),
                _hp, _hand, _bandwidth, new Random());
            return new Match { Game = game, Conns = new[] { p1, p2 } };
        }

        private static async Task SendWelcome(Match match, CancellationToken ct)
        {
            foreach (var c in match.Conns)
                await c.Send(ServerMessage.Welcome(c.Player, match.Game.BuildSnapshot(c.Player)), ct);
        }

        private static async Task RunReceiveLoop(Match match, PlayerConn conn, CancellationToken ct)
        {
            while (!ct.IsCancellationRequested && conn.Ws.State == WebSocketState.Open)
            {
                var text = await WsUtil.ReceiveText(conn.Ws, ct);
                if (text == null) break;

                CommandDto dto;
                try { dto = ProtocolJson.Deserialize<CommandDto>(text); }
                catch { await conn.Send(ServerMessage.OfError("Malformed command."), ct); continue; }
                if (dto == null) continue;

                List<EventDto> events;
                string error;
                bool ok;
                SnapshotDto snapP1 = null, snapP2 = null;

                await match.Gate.WaitAsync(ct);
                try
                {
                    ok = match.Game.Submit(conn.Player, dto, out events, out error);
                    if (ok)
                    {
                        snapP1 = match.Game.BuildSnapshot(PlayerId.P1);
                        snapP2 = match.Game.BuildSnapshot(PlayerId.P2);
                    }
                }
                finally { match.Gate.Release(); }

                if (!ok)
                {
                    await conn.Send(ServerMessage.OfError(error), ct);
                    continue;
                }

                foreach (var c in match.Conns)
                {
                    foreach (var e in events)
                    {
                        var filtered = FilterForRecipient(e, c.Player);
                        if (filtered != null) await c.Send(ServerMessage.OfEvent(filtered), ct);
                    }
                    await c.Send(ServerMessage.OfSnapshot(c.Player == PlayerId.P1 ? snapP1 : snapP2), ct);
                }
            }
        }

        /// <summary>Redact information the recipient shouldn't see (e.g., which card the opponent drew).</summary>
        private static EventDto FilterForRecipient(EventDto e, PlayerId recipient)
        {
            if (e.Kind == EventKind.CardDrawn && e.Player != recipient)
                return new EventDto { Kind = EventKind.CardDrawn, Player = e.Player }; // count only, id hidden
            return e;
        }

        // --- helper types ---
        private sealed class PlayerConn
        {
            public readonly WebSocket Ws;
            public PlayerId Player;
            private readonly SemaphoreSlim _sendLock = new(1, 1);

            public PlayerConn(WebSocket ws) => Ws = ws;

            public async Task Send(ServerMessage msg, CancellationToken ct)
            {
                await _sendLock.WaitAsync(ct);
                try { await WsUtil.SendText(Ws, ProtocolJson.Serialize(msg), ct); }
                finally { _sendLock.Release(); }
            }
        }

        private sealed class Match
        {
            public ServerMatch Game;
            public PlayerConn[] Conns;
            public readonly SemaphoreSlim Gate = new(1, 1);
        }
    }
}
