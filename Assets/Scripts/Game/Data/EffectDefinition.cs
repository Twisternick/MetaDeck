using System;
using MetaDeck.Rules;

namespace MetaDeck.Data
{
    [Serializable]
    public class EffectDefinition
    {
        public EffectType effectType;
        public int amount;

        // Extremely simple targeting for baseline.
        // You can replace this with a full selector system later.
        public SimpleTargeting targeting = SimpleTargeting.None;

        public SimpleCondition condition = SimpleCondition.None;

        public MetaDeck.Rules.Keyword keyword = MetaDeck.Rules.Keyword.None;
    }

    public enum SimpleCondition
    {
        None,
        TargetMustBeDamaged,
        AttackedThreeTimesThisTurn,
        CardsPlayedAtLeast1ThisTurn,
        CardsPlayedAtLeast3ThisTurn
    }
}