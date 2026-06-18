using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    public sealed class CombatResolver
    {
        public void ResolveAttack(GameState state, CardInstance attacker, CardInstance defender, IEventBus bus)
        {
            bus.Publish(new AttackDeclared(attacker, defender));

            bool aFS = attacker.Keywords.Contains(Keyword.FirstStrike);
            bool dFS = defender.Keywords.Contains(Keyword.FirstStrike);

            if (aFS && !dFS)
            {
                Deal(attacker, defender, attacker.GetAttack(), bus);
                if (!defender.IsDestroyed) Deal(defender, attacker, defender.GetAttack(), bus);
            }
            else if (!aFS && dFS)
            {
                Deal(defender, attacker, defender.GetAttack(), bus);
                if (!attacker.IsDestroyed) Deal(attacker, defender, attacker.GetAttack(), bus);
            }
            else
            {
                // simultaneous
                int aDmg = attacker.GetAttack();
                int dDmg = defender.GetAttack();

                defender.Health -= aDmg;
                attacker.Health -= dDmg;

                bus.Publish(new DamageDealt(attacker, defender, aDmg));
                bus.Publish(new DamageDealt(defender, attacker, dDmg));
            }
        }

        /// <summary>
        /// Resolve an attack against the opponent player directly (face). No retaliation.
        /// Guard/legality is checked before this is reached (CombatRules / GameFlowStateMachine).
        /// </summary>
        public void ResolveFaceAttack(GameState state, CardInstance attacker, PlayerId defenderPlayer, IEventBus bus)
        {
            int dmg = attacker.GetAttack();
            var p = state.GetPlayer(defenderPlayer);
            p.Hp -= dmg;
            bus.Publish(new PlayerDamaged(attacker, defenderPlayer, dmg));
        }

        private static void Deal(CardInstance src, CardInstance tgt, int amount, IEventBus bus)
        {
            tgt.Health -= amount;
            bus.Publish(new DamageDealt(src, tgt, amount));
        }
    }
}