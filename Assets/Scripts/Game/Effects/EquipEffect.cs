using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    // Equip: permanently attaches +amount/+amount and an optional keyword to a friendly monster.
    // The buff is a Permanent StatModifier sourced from the equip card, so it survives end of turn and
    // is carried on the host CardInstance until the host dies (the gear "falls off" with it). The equip
    // card itself resolves and goes to the graveyard like any spell. Targeting should be FriendlyMonster.
    public sealed class EquipEffect : IEffect
    {
        public const string Tag = "Equip";

        private readonly int _amount;
        private readonly Keyword _keyword;

        public EquipEffect(int amount, Keyword keyword)
        {
            _amount = amount;
            _keyword = keyword;
        }

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            if (ctx.Target.Target is not CardInstance ci || ci.Def.type != CardType.Monster)
            {
                reason = "Equip target must be a monster.";
                return false;
            }
            if (ci.Owner != ctx.Source.Owner)
            {
                reason = "You can only equip your own monster.";
                return false;
            }
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var m = (CardInstance)ctx.Target.Target!;

            if (_amount != 0)
                m.StatModifiers.Add(new StatModifier(Tag, _amount, _amount, ModifierDuration.Permanent, ctx.Source.InstanceId));

            if (_keyword != Keyword.None)
                m.Keywords.Add(_keyword);
        }
    }
}
