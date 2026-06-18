using System;
using MetaDeck.Core;
using MetaDeck.Engine;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    // Forces the opponent to discard `amount` random cards from their hand. targeting must be None.
    public sealed class DiscardRandomEffect : IEffect
    {
        private readonly int _amount;
        private static readonly Random _rng = new();

        public DiscardRandomEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var zones = new ZoneService();
            var opponent = ctx.State.OpponentOf(ctx.Source.Owner);
            var hand = ctx.State.GetPlayer(opponent).Hand;

            int count = Math.Min(_amount, hand.Cards.Count);
            for (int i = 0; i < count; i++)
            {
                if (hand.Cards.Count == 0) return;
                int idx = _rng.Next(hand.Cards.Count);
                var card = hand.Cards[idx];
                zones.Move(ctx.State, card, Zone.Hand, Zone.Graveyard, ctx.Bus);
                ctx.Bus.Publish(new CardDiscarded(card, Zone.Hand));
            }
        }
    }
}
