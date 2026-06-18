using System;
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
            
            _ => throw new NotImplementedException(def.effectType.ToString())
        };
    }
}