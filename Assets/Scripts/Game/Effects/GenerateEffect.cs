using System;
using MetaDeck.Core;

namespace MetaDeck.Effects
{
    // Generate: gives the source card's owner N temporary Bandwidth for the current turn. It is not
    // added to MaxBandwidth, so it naturally expires when the owner's Bandwidth refills next turn.
    public sealed class GenerateEffect : IEffect
    {
        private readonly int _amount;
        public GenerateEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason) { reason = ""; return true; }

        public void Resolve(EffectContext ctx)
        {
            if (_amount == 0) return;
            var player = ctx.State.GetPlayer(ctx.Source.Owner);
            player.Bandwidth = Math.Max(0, player.Bandwidth + _amount);
        }
    }
}
