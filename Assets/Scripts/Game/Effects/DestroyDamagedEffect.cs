using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    public sealed class DestroyDamagedEffect : IEffect
    {
        public bool CanActivate(EffectContext ctx, out string reason)
        {
            if (ctx.Target.Target is not CardInstance m || m.Def.type != CardType.Monster)
            {
                reason = "Target must be a monster.";
                return false;
            }

            if (m.GetHealth() >= m.GetMaxHealth())
            {
                reason = "Target is not damaged.";
                return false;
            }

            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var m = (CardInstance)ctx.Target.Target!;
            m.Health = 0;
        }
    }
}