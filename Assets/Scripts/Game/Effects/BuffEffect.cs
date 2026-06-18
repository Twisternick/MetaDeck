using MetaDeck.Core;

namespace MetaDeck.Effects
{
    // Simple: +X/+X to a targeted monster.
    public sealed class BuffEffect : IEffect
    {
        private readonly int _amount;
        public BuffEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            if (ctx.Target.Target is not CardInstance ci || ci.Def.type != MetaDeck.Rules.CardType.Monster)
            {
                reason = "Target must be a monster.";
                return false;
            }
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var m = (CardInstance)ctx.Target.Target!;
            m.Attack += _amount;
            m.Health += _amount;
        }
    }
}