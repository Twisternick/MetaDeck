using System;
using MetaDeck.Core;

namespace MetaDeck.Effects
{
    // Gives the source card's owner N Nitro. Use amount < 0 to drain (clamped to 0).
    public sealed class GainNitroEffect : IEffect
    {
        private readonly int _amount;
        public GainNitroEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason) { reason = ""; return true; }

        public void Resolve(EffectContext ctx)
        {
            var player = ctx.State.GetPlayer(ctx.Source.Owner);
            player.Nitro = Math.Max(0, player.Nitro + _amount);
        }
    }
}
