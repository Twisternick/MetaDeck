using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    /// <summary>
    /// Central application of damage to a MONSTER so defensive keywords apply everywhere (combat AND
    /// effects):
    ///   PoweredUp — the first instance of damage is prevented entirely, and PoweredUp is removed.
    ///   Fortify   — every instance takes 1 less damage.
    /// Publishes DamageDealt only when damage actually lands, so triggers like Suppression/Headshot
    /// don't fire on a fully-prevented hit. Player (face) damage does NOT go through here.
    /// </summary>
    public static class CombatMath
    {
        public static void DamageMonster(CardInstance source, CardInstance target, int amount, IEventBus bus)
        {
            if (target == null || amount <= 0) return;

            // PoweredUp: absorb the first hit, then it's gone.
            if (target.HasKeyword(Keyword.PoweredUp))
            {
                target.Keywords.Remove(Keyword.PoweredUp);
                target.RemoveKeywordThisTurn(Keyword.PoweredUp);
                return;
            }

            if (target.HasKeyword(Keyword.Fortify))
                amount = System.Math.Max(0, amount - 1);

            if (amount <= 0) return;

            target.Health -= amount;
            bus.Publish(new DamageDealt(source, target, amount));
        }
    }
}
