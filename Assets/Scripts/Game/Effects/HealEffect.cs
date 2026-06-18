using System;
using MetaDeck.Core;

namespace MetaDeck.Effects
{
    // Restores HP to the spell owner's player. targeting must be None.
    public sealed class HealEffect : IEffect
    {
        private readonly int _amount;
        private const int MaxHp = 30;

        public HealEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var player = ctx.State.GetPlayer(ctx.Source.Owner);
            player.Hp = Math.Min(MaxHp, player.Hp + _amount);
        }
    }
}
