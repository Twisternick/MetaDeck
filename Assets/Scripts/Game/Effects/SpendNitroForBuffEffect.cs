using System;
using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    // Buffs a friendly monster. With Nitro: spends 1 and gives full amount. Without: gives amount/2 (min 1).
    public sealed class SpendNitroForBuffEffect : IEffect
    {
        private readonly int _amount;
        public SpendNitroForBuffEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            if (ctx.Target.Target is not CardInstance ci || ci.Def.type != CardType.Monster)
            {
                reason = "Target must be a monster.";
                return false;
            }
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var monster = (CardInstance)ctx.Target.Target!;
            var player = ctx.State.GetPlayer(ctx.Source.Owner);

            if (player.Nitro >= 1)
            {
                player.Nitro -= 1;
                monster.Attack += _amount;
                monster.Health += _amount;
            }
            else
            {
                int baseAmount = Math.Max(1, _amount / 2);
                monster.Attack += baseAmount;
                monster.Health += baseAmount;
            }
        }
    }
}
