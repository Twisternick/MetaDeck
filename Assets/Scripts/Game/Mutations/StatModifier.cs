namespace MetaDeck.Rules
{
    public enum ModifierDuration
    {
        Permanent = 0,
        UntilEndOfTurn = 1,
        UntilEndOfCombat = 2
    }

    /// <summary>
    /// Modifier entry stored on a CardInstance.
    /// Immutable value type (C# 9 friendly).
    /// </summary>
    public readonly struct StatModifier
    {
        public readonly string Tag;
        public readonly int AttackDelta;
        public readonly int HealthDelta;
        public readonly ModifierDuration Duration;
        public readonly string SourceInstanceId; // optional; can be null

        public StatModifier(
            string tag,
            int attackDelta,
            int healthDelta,
            ModifierDuration duration,
            string sourceInstanceId = null
        )
        {
            Tag = tag;
            AttackDelta = attackDelta;
            HealthDelta = healthDelta;
            Duration = duration;
            SourceInstanceId = sourceInstanceId;
        }

        public override string ToString()
            => $"{Tag}: {AttackDelta:+#;-#;0}/{HealthDelta:+#;-#;0} ({Duration})";
    }
}