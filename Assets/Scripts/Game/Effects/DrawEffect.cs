using MetaDeck.Core;
using MetaDeck.Engine;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    public sealed class DrawEffect : IEffect
    {
        private readonly int _amount;

        public DrawEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var zones = new ZoneService();

            var owner = ctx.Source.Owner;
            var player = ctx.State.GetPlayer(owner);

            for (int i = 0; i < _amount; i++)
            {
                if (player.Deck.Cards.Count == 0) return;

                // top of deck = last
                var top = player.Deck.Cards[player.Deck.Cards.Count - 1];

                MetaDeck.Diagnostics.GameLog.Debug($"DrawEffect ctx.Bus = {ctx.Bus.GetType().Name}");

                // Move to hand (should update Zone + publish CardMoved internally)
                zones.Move(ctx.State, top, Zone.Deck, Zone.Hand, ctx.Bus);

                // IMPORTANT: publish CardDrawn so keywords can react (Topdeck, etc.)
                ctx.Bus.Publish(new CardDrawn(owner, top));
            }
        }
    }
}