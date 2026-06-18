using System;
using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Engine;
using MetaDeck.Events;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Server
{
    /// <summary>
    /// One authoritative match: owns the GameState/engine/flow, builds it from CardDef decks
    /// (no Unity), validates that a command's sender actually controls the acting card / has
    /// turn or priority (anti-cheat the engine can't do on its own), submits to the engine, and
    /// captures the resulting events. Networking lives in MatchServer.
    /// </summary>
    public sealed class ServerMatch
    {
        public GameState State { get; }
        public GameEngine Engine { get; }
        public GameFlowStateMachine Flow { get; }

        private readonly CapturingEventBus _capture;
        private readonly Dictionary<string, CardInstance> _index = new();
        private readonly CommandFactory _factory;

        public ServerMatch(IReadOnlyList<CardDef> p1Deck, IReadOnlyList<CardDef> p2Deck,
                           int startingHp, int openingHandSize, int startingBandwidth, Random rng)
        {
            var p1 = new PlayerState(PlayerId.P1, startingHp);
            var p2 = new PlayerState(PlayerId.P2, startingHp);
            State = new GameState(p1, p2);

            // Bus chain: KeywordRouting -> Capture -> EventBus. The mutator also publishes through
            // Capture so keyword-reaction events are captured too.
            var realBus = new EventBus();
            _capture = new CapturingEventBus(realBus);

            var registry = MetaDeck.Rules.Keywords.Registry.KeywordModule.BuildDefaultRegistry();
            var cardQuery = new MetaDeck.Rules.Keywords.Service.BoardOnlyCardQuery();
            var keywordService = new MetaDeck.Rules.Keywords.Service.KeywordService(registry, cardQuery);
            var mutator = new MetaDeck.Engine.Mutations.GameMutator(_capture);

            IEventBus bus = new KeywordRoutingEventBus(State, _capture, keywordService, mutator);
            Engine = new GameEngine(State, bus);
            Flow = new GameFlowStateMachine(Engine, bus);

            BuildDeck(PlayerId.P1, p1Deck);
            BuildDeck(PlayerId.P2, p2Deck);
            Shuffle(PlayerId.P1, rng);
            Shuffle(PlayerId.P2, rng);

            var active = State.GetPlayer(State.ActivePlayer);
            active.MaxBandwidth = startingBandwidth;
            active.Bandwidth = startingBandwidth;

            Draw(PlayerId.P1, openingHandSize);
            Draw(PlayerId.P2, openingHandSize);

            _factory = new CommandFactory(Resolve, Engine.Zones, Engine.Effects, Flow);
        }

        public CardInstance Resolve(string id) => id != null && _index.TryGetValue(id, out var c) ? c : null;

        public SnapshotDto BuildSnapshot(PlayerId viewer)
            => SnapshotBuilder.Build(State, viewer, Flow.Phase, Flow.PriorityPlayer);

        /// <summary>Validate the sender, build the command, submit it, and capture resulting events.</summary>
        public bool Submit(PlayerId sender, CommandDto dto, out List<EventDto> events, out string error)
        {
            events = new List<EventDto>();

            if (!ValidateSender(sender, dto, out error)) return false;
            if (!_factory.TryBuild(dto, out var command, out error)) return false;

            _capture.BeginCapture(events);
            try { return Engine.Submit(command, out error); }
            catch (Exception ex) { error = "Server error resolving command: " + ex.Message; return false; }
            finally { _capture.EndCapture(); }
        }

        // --- anti-cheat: ensure the sender is allowed to issue this command ---
        private bool ValidateSender(PlayerId sender, CommandDto dto, out string error)
        {
            error = "";
            switch (dto.Kind)
            {
                case CommandKind.PlayCard:
                case CommandKind.SummonMonster:
                case CommandKind.BeginAttackMonster:
                case CommandKind.BeginAttackFace:
                case CommandKind.RespondQuickFromHand:
                case CommandKind.ActivateMonsterEffect:
                {
                    var actor = Resolve(dto.CardInstanceId);
                    if (actor == null) { error = "Unknown card."; return false; }
                    if (actor.Owner != sender) { error = "You do not control that card."; return false; }
                    return true;
                }
                case CommandKind.EndTurn:
                    if (State.ActivePlayer != sender) { error = "Not your turn."; return false; }
                    return true;
                case CommandKind.PassPriority:
                    if (Flow.PriorityPlayer != sender) { error = "You do not have priority."; return false; }
                    return true;
                default:
                    error = $"Unsupported command {dto.Kind}.";
                    return false;
            }
        }

        // --- deck building (CardDef -> CardInstance), server-side ---
        private void BuildDeck(PlayerId owner, IReadOnlyList<CardDef> defs)
        {
            if (defs == null) return;
            var p = State.GetPlayer(owner);
            foreach (var def in defs)
            {
                if (def == null) continue;
                var card = new CardInstance(Guid.NewGuid().ToString("N"), def, owner) { Zone = Zone.Deck };
                _index[card.InstanceId] = card;
                p.Deck.Add(card);
            }
        }

        private void Shuffle(PlayerId owner, Random rng)
        {
            var p = State.GetPlayer(owner);
            var tmp = new List<CardInstance>(p.Deck.Cards);
            for (int i = tmp.Count - 1; i > 0; i--)
            {
                int j = rng.Next(0, i + 1);
                (tmp[i], tmp[j]) = (tmp[j], tmp[i]);
            }
            while (p.Deck.Cards.Count > 0) p.Deck.Remove(p.Deck.Cards[p.Deck.Cards.Count - 1]);
            foreach (var c in tmp) { p.Deck.Add(c); c.Zone = Zone.Deck; }
        }

        private void Draw(PlayerId owner, int amount)
        {
            var p = State.GetPlayer(owner);
            for (int i = 0; i < amount && p.Deck.Cards.Count > 0; i++)
            {
                var top = p.Deck.Cards[p.Deck.Cards.Count - 1];
                Engine.Zones.Move(State, top, Zone.Deck, Zone.Hand, Engine.Bus);
            }
        }
    }
}
