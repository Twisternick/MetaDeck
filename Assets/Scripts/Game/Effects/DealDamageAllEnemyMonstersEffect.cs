using MetaDeck.Core;
using MetaDeck.Events;

namespace MetaDeck.Effects
{
    // Deals damage to every monster on the opponent's side of the board. targeting must be None.
    public sealed class DealDamageAllEnemyMonstersEffect : IEffect
    {
        private readonly int _amount;

        public DealDamageAllEnemyMonstersEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var opponent = ctx.State.OpponentOf(ctx.Source.Owner);
            for (int i = 0; i < 5; i++)
            {
                var monster = ctx.State.Board.GetAt(opponent, i);
                if (monster == null) continue;
                MetaDeck.Engine.CombatMath.DamageMonster(ctx.Source, monster, _amount, ctx.Bus);
            }
        }
    }
}
