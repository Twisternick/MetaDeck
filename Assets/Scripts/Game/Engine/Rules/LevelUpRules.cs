using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    /// <summary>
    /// LevelUp — a monster with the LevelUp keyword and at least <see cref="Threshold"/> XP counters is
    /// "Leveled Up" and gains +<see cref="Bonus"/>/+<see cref="Bonus"/> (a default bonus, since cards
    /// have no custom LevelUp field yet). Kept in sync via a tagged StatModifier; call <see cref="Refresh"/>
    /// whenever a monster's XP counters change.
    /// </summary>
    public static class LevelUpRules
    {
        public const string Tag = "LevelUp";
        public const string XpCounterKey = "XP";
        public const int Threshold = 3;
        public const int Bonus = 2;

        public static void Refresh(CardInstance monster)
        {
            if (monster == null) return;

            bool leveled = monster.HasKeyword(Keyword.LevelUp)
                           && monster.Counters.TryGetValue(XpCounterKey, out var xp)
                           && xp >= Threshold;

            bool hasBonus = monster.StatModifiers.Exists(s => s.Tag == Tag);

            if (leveled && !hasBonus)
                monster.StatModifiers.Add(new StatModifier(Tag, Bonus, Bonus, ModifierDuration.Permanent, monster.InstanceId));
            else if (!leveled && hasBonus)
                monster.StatModifiers.RemoveAll(s => s.Tag == Tag);
        }
    }
}
