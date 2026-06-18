using System;
using System.Diagnostics;
using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    public sealed class ZoneService
    {
        public void Move(GameState state, CardInstance card, Zone from, Zone to, IEventBus bus)
        {
            if (card.Zone != from)
                throw new InvalidOperationException($"Zone mismatch. Expected {from}, got {card.Zone} for {card}");

            RemoveFromZone(state, card, from);
            AddToZone(state, card, to);

            card.Zone = to;
            bus.Publish(new CardMoved(card, from, to));

            if (to == Zone.Graveyard) bus.Publish(new CardEnteredGraveyard(card, from));
            if (from == Zone.Graveyard) bus.Publish(new CardLeftGraveyard(card, to));
        }

        private void RemoveFromZone(GameState state, CardInstance card, Zone from)
        {
            var owner = state.GetPlayer(card.Owner);

            switch (from)
            {
                case Zone.Deck: owner.Deck.Remove(card); break;
                case Zone.Hand: owner.Hand.Remove(card); break;
                case Zone.Graveyard: owner.Graveyard.Remove(card); break;
                case Zone.Void: owner.Exile.Remove(card); break;
                case Zone.Board:
                    RemoveFromBoard(state, card);
                    break;
                default: throw new NotImplementedException(from.ToString());
            }
        }

        private void AddToZone(GameState state, CardInstance card, Zone to)
        {
            var owner = state.GetPlayer(card.Owner);

            switch (to)
            {
                case Zone.Deck: owner.Deck.Add(card); break;
                case Zone.Hand: owner.Hand.Add(card); break;
                case Zone.Graveyard: owner.Graveyard.Add(card); break;
                case Zone.Void: owner.Exile.Add(card); break;
                case Zone.Board:
                    // Board placement is handled by SummonCommand (needs slot)
                    throw new InvalidOperationException("Use SummonMonsterToSlot for board placement.");
                default: throw new NotImplementedException(to.ToString());
            }
        }

        public void SummonMonsterToSlot(GameState state, CardInstance monster, Zone from, int slot, IEventBus bus)
        {
            if (monster.Def.type != CardType.Monster)
                throw new InvalidOperationException("Only monsters can be summoned to board.");

            if (monster.Zone != from)
                throw new InvalidOperationException($"Zone mismatch. Expected {from}, got {monster.Zone}.");

            if (state.Board.GetAt(monster.Owner, slot) != null)
                throw new InvalidOperationException("Board slot occupied.");

            RemoveFromZone(state, monster, from);
            state.Board.SetAt(monster.Owner, slot, monster);

            var old = monster.Zone;
            monster.Zone = Zone.Board;
            monster.SummonedTurn = state.TurnNumber; // for tracking summon sickness, etc.

            bus.Publish(new CardMoved(monster, old, Zone.Board));
            bus.Publish(new MonsterSummoned(monster));
        }

        private void RemoveFromBoard(GameState state, CardInstance card)
        {
            for (int i = 0; i < 5; i++)
            {
                if (state.Board.GetAt(card.Owner, i) == card)
                {
                    state.Board.SetAt(card.Owner, i, null);
                    return;
                }
            }
        }
    }
}