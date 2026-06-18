using System;
using System.Collections.Generic;
using System.Linq;
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
    /// WebSocket host with a lobby. A connection starts in the lobby and sends a <see cref="LobbyRequest"/>
    /// (Quick Match / Create Room / Join Room); the server pairs two players into an authoritative
    /// <see cref="ServerMatch"/>, then switches that connection to reading <see cref="CommandDto"/>s.
    /// Per-match command execution is serialized by a gate (the engine is single-threaded).
    /// </summary>
    public sealed class MatchServer
    {
        private readonly HttpListener _listener = new();
        private readonly IReadOnlyList<CardDef> _catalog;
        private readonly int _deckSize, _hp, _hand, _bandwidth;
        private readonly Random _rng = new();

        // Lobby state (guarded by _lobbyLock).
        private readonly object _lobbyLock = new();
        private readonly Dictionary<string, PlayerConn> _rooms = new(StringComparer.OrdinalIgnoreCase);
        private PlayerConn _quickWaiting;

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
                catch { break; }

                if (!ctx.Request.IsWebSocketRequest) { ctx.Response.StatusCode = 400; ctx.Response.Close(); continue; }

                var wsCtx = await ctx.AcceptWebSocketAsync(null);
                _ = HandleConnection(wsCtx.WebSocket, ct);
            }
        }

        private async Task HandleConnection(WebSocket ws, CancellationToken ct)
        {
            var conn = new PlayerConn(ws);
            try
            {
                while (!ct.IsCancellationRequested && ws.State == WebSocketState.Open)
                {
                    var text = await WsUtil.ReceiveText(ws, ct);
                    if (text == null) break;

                    if (conn.Match == null) await HandleLobby(conn, text, ct);  // not yet matched
                    else await HandleCommand(conn, text, ct);                    // in a match
                }
            }
            catch (OperationCanceledException) { }
            finally
            {
                ForgetInLobby(conn);
                await DetachFromMatch(conn, notifyOpponent: true); // if mid-match, free the opponent
                try { await ws.CloseAsync(WebSocketCloseStatus.NormalClosure, "bye", CancellationToken.None); } catch { }
            }
        }

        /// <summary>Remove a connection from its match; optionally tell the opponent they're back in the lobby.</summary>
        private static async Task DetachFromMatch(PlayerConn conn, bool notifyOpponent)
        {
            var match = conn.Match;
            if (match == null) return;

            conn.Match = null;
            conn.WantsRematch = false;

            foreach (var other in match.Conns)
            {
                if (other == conn || other.Match != match) continue;
                other.Match = null;
                other.WantsRematch = false;
                if (notifyOpponent)
                {
                    try { await other.Send(ServerMessage.OpponentLeftMsg(), CancellationToken.None); } catch { }
                }
            }
        }

        // ----------------------------- Lobby -----------------------------

        private async Task HandleLobby(PlayerConn conn, string text, CancellationToken ct)
        {
            LobbyRequest req;
            try { req = ProtocolJson.Deserialize<LobbyRequest>(text); }
            catch { await conn.Send(ServerMessage.OfError("Malformed lobby request."), ct); return; }
            if (req == null) return;

            // Remember this player's requested deck for when the match starts.
            conn.DeckCardIds = req.DeckCardIds;
            conn.Archetype = req.Archetype;

            PlayerConn pairWith = null;
            string reply = null;     // serialized non-pairing reply, sent after the lock
            ServerMessage replyMsg = null;

            lock (_lobbyLock)
            {
                switch (req.Kind)
                {
                    case LobbyRequestKind.QuickMatch:
                        if (_quickWaiting != null && _quickWaiting != conn)
                        {
                            pairWith = _quickWaiting;
                            _quickWaiting = null;
                        }
                        else
                        {
                            _quickWaiting = conn;
                            replyMsg = ServerMessage.WaitingMsg();
                        }
                        break;

                    case LobbyRequestKind.CreateRoom:
                    {
                        var code = NewRoomCode();
                        _rooms[code] = conn;
                        conn.RoomCode = code;
                        replyMsg = ServerMessage.RoomCreatedMsg(code);
                        break;
                    }

                    case LobbyRequestKind.JoinRoom:
                        if (!string.IsNullOrEmpty(req.RoomCode) &&
                            _rooms.TryGetValue(req.RoomCode, out var creator) && creator != conn)
                        {
                            _rooms.Remove(req.RoomCode);
                            pairWith = creator;
                        }
                        else
                        {
                            replyMsg = ServerMessage.OfError("No such room.");
                        }
                        break;

                    case LobbyRequestKind.Cancel:
                        ForgetInLobbyLocked(conn);
                        break;
                }
            }

            if (pairWith != null) await StartMatch(pairWith, conn, ct); // creator/waiter is P1
            else if (replyMsg != null) await conn.Send(replyMsg, ct);
        }

        private async Task StartMatch(PlayerConn p1, PlayerConn p2, CancellationToken ct)
        {
            p1.Player = PlayerId.P1;
            p2.Player = PlayerId.P2;

            var game = new ServerMatch(
                DeckService.Build(_catalog, p1.DeckCardIds, p1.Archetype, _deckSize, _rng),
                DeckService.Build(_catalog, p2.DeckCardIds, p2.Archetype, _deckSize, _rng),
                _hp, _hand, _bandwidth, _rng);

            var match = new Match { Game = game, Conns = new[] { p1, p2 } };
            p1.Match = match;
            p2.Match = match;

            foreach (var c in match.Conns)
                await c.Send(ServerMessage.Welcome(c.Player, game.BuildSnapshot(c.Player)), ct);
        }

        private string NewRoomCode()
        {
            const string alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous chars
            string code;
            do
            {
                var chars = new char[4];
                for (int i = 0; i < chars.Length; i++) chars[i] = alphabet[_rng.Next(alphabet.Length)];
                code = new string(chars);
            } while (_rooms.ContainsKey(code));
            return code;
        }

        private void ForgetInLobby(PlayerConn conn)
        {
            lock (_lobbyLock) ForgetInLobbyLocked(conn);
        }

        private void ForgetInLobbyLocked(PlayerConn conn)
        {
            if (_quickWaiting == conn) _quickWaiting = null;
            if (conn.RoomCode != null) { _rooms.Remove(conn.RoomCode); conn.RoomCode = null; }
        }

        // ----------------------------- Match -----------------------------

        private async Task HandleCommand(PlayerConn conn, string text, CancellationToken ct)
        {
            CommandDto dto;
            try { dto = ProtocolJson.Deserialize<CommandDto>(text); }
            catch { await conn.Send(ServerMessage.OfError("Malformed command."), ct); return; }
            if (dto == null) return;

            // Match-session control is handled here, not by the engine.
            if (dto.Kind == CommandKind.LeaveMatch) { await DetachFromMatch(conn, notifyOpponent: true); return; }
            if (dto.Kind == CommandKind.Rematch) { await HandleRematch(conn, ct); return; }

            var match = conn.Match;
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

            if (!ok) { await conn.Send(ServerMessage.OfError(error), ct); return; }

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

        private async Task HandleRematch(PlayerConn conn, CancellationToken ct)
        {
            var match = conn.Match;
            if (match == null) return;

            conn.WantsRematch = true;
            if (!match.Conns.All(c => c.WantsRematch))
            {
                await conn.Send(ServerMessage.RematchPendingMsg(), ct); // waiting on the other player
                return;
            }

            // Both agreed: rebuild a fresh match with the same players, sides, and deck selections.
            var p1 = match.Conns.First(c => c.Player == PlayerId.P1);
            var p2 = match.Conns.First(c => c.Player == PlayerId.P2);

            await match.Gate.WaitAsync(ct);
            try
            {
                match.Game = new ServerMatch(
                    DeckService.Build(_catalog, p1.DeckCardIds, p1.Archetype, _deckSize, _rng),
                    DeckService.Build(_catalog, p2.DeckCardIds, p2.Archetype, _deckSize, _rng),
                    _hp, _hand, _bandwidth, _rng);
                foreach (var c in match.Conns) c.WantsRematch = false;
            }
            finally { match.Gate.Release(); }

            foreach (var c in match.Conns)
                await c.Send(ServerMessage.Welcome(c.Player, match.Game.BuildSnapshot(c.Player)), ct);
        }

        private static EventDto FilterForRecipient(EventDto e, PlayerId recipient)
        {
            if (e.Kind == EventKind.CardDrawn && e.Player != recipient)
                return new EventDto { Kind = EventKind.CardDrawn, Player = e.Player };
            return e;
        }

        // ----------------------------- Types -----------------------------

        private sealed class PlayerConn
        {
            public readonly WebSocket Ws;
            public PlayerId Player;
            public Match Match;
            public string RoomCode;
            public string[] DeckCardIds;
            public string Archetype;
            public bool WantsRematch;
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
