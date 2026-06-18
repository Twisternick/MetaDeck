using MetaDeck.Data;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    public static class EffectFactory
    {
        public static IEffect Create(EffectDefinition def) => def.effectType switch
        {
            EffectType.DealDamage => new DealDamageEffect(def.amount, def.targeting, def.condition),
            EffectType.Draw => new DrawEffect(def.amount),
            EffectType.Buff => new BuffEffect(def.amount),
            EffectType.DestroyDamaged => new DestroyDamagedEffect(),
            EffectType.ReviveFromGraveyard => new ReviveFromGraveyardEffect(),
            EffectType.Heal => new HealEffect(def.amount),
            EffectType.DealDamageAllEnemyMonsters => new DealDamageAllEnemyMonstersEffect(def.amount),
            EffectType.BuffAllFriendlyMonsters => new BuffAllFriendlyMonstersEffect(def.amount),
            EffectType.DiscardRandom => new DiscardRandomEffect(def.amount),
            EffectType.GainNitro => new GainNitroEffect(def.amount),
            EffectType.SpendNitroForBuff => new SpendNitroForBuffEffect(def.amount),
            EffectType.GainXPCounter => new GainXPCounterEffect(def.amount),

            // Not yet implemented: don't crash the match — treat as a no-op and warn.
            _ => NoOp(def.effectType)
        };

        private static IEffect NoOp(EffectType type)
        {
            MetaDeck.Diagnostics.GameLog.Warn($"EffectType '{type}' is not implemented; treating as no-op.");
            return new NoOpEffect();
        }

        private sealed class NoOpEffect : IEffect
        {
            public bool CanActivate(EffectContext ctx, out string reason) { reason = ""; return true; }
            public void Resolve(EffectContext ctx) { /* intentionally does nothing */ }
        }
    }
}
