using System;
using System.Collections.Generic;

using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Engine;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    public sealed class MatchBootstrapper
    {
        public sealed class Result
        {
            public GameEngine Engine;
            public GameState State;
            public IEventBus Bus;
            public Dictionary<string, CardInstance> InstanceIndex;
        }

        private readonly System.Random _rng;

        public MatchBootstrapper(System.Random rng)
        {
            _rng = rng ?? new System.Random();
        }

        public Result BuildNewGame(List<CardDefinition> player1Deck, List<CardDefinition> player2Deck, int startingHp, int openingHandSize, int startingBandwidth = 1)
        {
            // Raw bus (actual subscribers live here)
            var realBus = new EventBus();

            var p1 = new PlayerState(PlayerId.P1, startingHp);
            var p2 = new PlayerState(PlayerId.P2, startingHp);

            var state = new GameState(p1, p2);

            // --- build keyword system and WRAP bus BEFORE engine is created ---
            var registry = MetaDeck.Rules.Keywords.Registry.KeywordModule.BuildDefaultRegistry();
            var cardQuery = new MetaDeck.Rules.Keywords.Service.BoardOnlyCardQuery();
            var keywordService = new MetaDeck.Rules.Keywords.Service.KeywordService(registry, cardQuery);

            var mutator = new MetaDeck.Engine.Mutations.GameMutator(realBus);

            // Wrapped bus (publish -> realBus, then keyword reactions)
            IEventBus bus = new MetaDeck.Events.KeywordRoutingEventBus(state, realBus, keywordService, mutator);
            // --- end wrapping ---

            // Engine must use the WRAPPED bus
            var engine = new GameEngine(state, bus);

            var index = new Dictionary<string, CardInstance>();

            BuildDeck(state, index, PlayerId.P1, player1Deck);
            BuildDeck(state, index, PlayerId.P2, player2Deck);

            ShuffleDeck(state, PlayerId.P1);
            ShuffleDeck(state, PlayerId.P2);

            // Turn 1 starts at startingBandwidth; EndTurnCommand ramps MaxBandwidth by +1
            // each turn up to a cap of 10 (Hearthstone-style mana curve).
            var active = state.GetPlayer(state.ActivePlayer);
            active.MaxBandwidth = startingBandwidth;
            active.Bandwidth = startingBandwidth;

            Draw(engine, state, PlayerId.P1, openingHandSize);
            Draw(engine, state, PlayerId.P2, openingHandSize);

            return new Result
            {
                Engine = engine,
                State = state,
                Bus = bus,              // IMPORTANT: return wrapped bus
                InstanceIndex = index
            };
        }

        private void BuildDeck(GameState state, Dictionary<string, CardInstance> index, PlayerId owner, List<CardDefinition> defs)
        {
            var p = state.GetPlayer(owner);
            if (defs == null) return;

            for (int i = 0; i < defs.Count; i++)
            {
                var def = defs[i];
                if (def == null) continue;

                var instanceId = Guid.NewGuid().ToString("N");
                var card = new CardInstance(instanceId, def, owner);

                index[card.InstanceId] = card;

                card.Zone = Zone.Deck;
                p.Deck.Add(card);
            }
        }

        private void ShuffleDeck(GameState state, PlayerId owner)
        {
            var p = state.GetPlayer(owner);
            var tmp = new List<CardInstance>(p.Deck.Cards);

            for (int i = tmp.Count - 1; i > 0; i--)
            {
                int j = _rng.Next(0, i + 1);
                (tmp[i], tmp[j]) = (tmp[j], tmp[i]);
            }

            while (p.Deck.Cards.Count > 0)
            {
                p.Deck.Remove(p.Deck.Cards[p.Deck.Cards.Count - 1]);
            }

            for (int k = 0; k < tmp.Count; k++)
            {
                p.Deck.Add(tmp[k]);
                tmp[k].Zone = Zone.Deck;
            }
        }

        private void Draw(GameEngine engine, GameState state, PlayerId playerId, int amount)
        {
            var p = state.GetPlayer(playerId);

            for (int i = 0; i < amount; i++)
            {
                if (p.Deck.Cards.Count == 0) return;

                var top = p.Deck.Cards[p.Deck.Cards.Count - 1];
                engine.Zones.Move(state, top, Zone.Deck, Zone.Hand, engine.Bus);
            }
        }
    }
}