using MetaDeck.Data;
using MetaDeck.Engine;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.Core;

namespace MetaDeck.Effects
{
    public sealed class DealDamageEffect : IEffect
    {
        private readonly int _amount;
        private readonly SimpleTargeting _targeting;
        private readonly SimpleCondition _condition;

        public DealDamageEffect(int amount, SimpleTargeting targeting, SimpleCondition condition)
        {
            _amount = amount;
            _targeting = targeting;
            _condition = condition;
        }

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            if (ctx.Target.Target == null)
            {
                reason = "No target selected.";
                return false;
            }

            if (ctx.Target.Target is CardInstance stealthCheck && CombatRules.IsUntargetableByEnemy(stealthCheck, ctx.Source.Owner))
            {
                reason = "Target has Stealth.";
                return false;
            }

            if (_condition == SimpleCondition.TargetMustBeDamaged && ctx.Target.Target is CardInstance ci)
            {
                if (ci.Def.type != CardType.Monster || ci.GetHealth() >= ci.GetMaxHealth())
                {
                    reason = "Target is not damaged.";
                    return false;
                }
            }

            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            if (ctx.Target.Target is CardInstance monster)
            {
                CombatMath.DamageMonster(ctx.Source, monster, _amount, ctx.Bus); // applies Fortify/PoweredUp
            }
            else if (ctx.Target.Target is PlayerId pid)
            {
                var p = ctx.State.GetPlayer(pid);
                p.Hp -= _amount;
                ctx.Bus.Publish(new DamageDealt(ctx.Source, pid, _amount));
            }
        }
    }
}