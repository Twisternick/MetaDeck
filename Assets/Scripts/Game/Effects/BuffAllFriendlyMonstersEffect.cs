using MetaDeck.Core;

namespace MetaDeck.Effects
{
    // Permanently buffs every monster on the spell owner's side of the board. targeting must be None.
    public sealed class BuffAllFriendlyMonstersEffect : IEffect
    {
        private readonly int _amount;

        public BuffAllFriendlyMonstersEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var owner = ctx.Source.Owner;
            for (int i = 0; i < 5; i++)
            {
                var monster = ctx.State.Board.GetAt(owner, i);
                if (monster == null) continue;
                monster.Attack += _amount;
                monster.Health += _amount;
            }
        }
    }
}
