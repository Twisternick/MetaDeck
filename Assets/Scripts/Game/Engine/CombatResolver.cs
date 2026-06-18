using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    public sealed class CombatResolver
    {
        public void ResolveAttack(GameState state, CardInstance attacker, CardInstance defender, IEventBus bus)
        {
            OnAttackDeclared(state, attacker);
            bus.Publish(new AttackDeclared(attacker, defender)); // Fear etc. react here (before damage)

            // Headshot: executes an already-damaged enemy outright instead of trading blows.
            if (attacker.HasKeyword(Keyword.Headshot) && IsDamaged(defender) && !defender.IsDestroyed)
            {
                Kill(defender);
                bus.Publish(new DamageDealt(attacker, defender, defender.GetMaxHealth()));
            }
            else
            {
                bool aFS = attacker.HasKeyword(Keyword.FirstStrike);
                bool dFS = defender.HasKeyword(Keyword.FirstStrike);

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
                    // Simultaneous: compute both from pre-combat stats, then apply both.
                    int aDmg = attacker.GetAttack();
                    int dDmg = defender.GetAttack();
                    Deal(attacker, defender, aDmg, bus);
                    Deal(defender, attacker, dDmg, bus);
                }
            }

            // Combat-outcome keywords (from the attacker's perspective).
            if (!attacker.IsDestroyed)
            {
                if (attacker.HasKeyword(Keyword.Devour) && defender.IsDestroyed)
                    attacker.StatModifiers.Add(new StatModifier("Devour", 1, 1, ModifierDuration.Permanent, attacker.InstanceId));

                if (attacker.HasKeyword(Keyword.Overtake)) // attacked and survived
                    state.GetPlayer(attacker.Owner).Nitro += 1;
            }
        }

        /// <summary>
        /// Resolve an attack against the opponent player directly (face). No retaliation.
        /// Guard/legality is checked before this is reached (CombatRules / GameFlowStateMachine).
        /// </summary>
        public void ResolveFaceAttack(GameState state, CardInstance attacker, PlayerId defenderPlayer, IEventBus bus)
        {
            OnAttackDeclared(state, attacker);

            int dmg = attacker.GetAttack();
            state.GetPlayer(defenderPlayer).Hp -= dmg;
            bus.Publish(new PlayerDamaged(attacker, defenderPlayer, dmg));

            if (attacker.HasKeyword(Keyword.Overtake)) // attacked and survived (no retaliation from face)
                state.GetPlayer(attacker.Owner).Nitro += 1;
        }

        private static void OnAttackDeclared(GameState state, CardInstance attacker)
        {
            // Stealth drops once it attacks; record this turn's attack for DoubleJump's once-per-turn bypass.
            attacker.Keywords.Remove(Keyword.Stealth);
            attacker.RemoveKeywordThisTurn(Keyword.Stealth);
            attacker.Counters[CombatRules.DoubleJumpTurnKey] = state.TurnNumber;
            state.GetPlayer(attacker.Owner).AttacksThisTurn++; // Momentum
        }

        private static bool IsDamaged(CardInstance c)
            => c.Def.type == CardType.Monster && c.GetHealth() < c.GetMaxHealth();

        private static void Kill(CardInstance c) => c.Health -= c.GetHealth(); // forces GetHealth() to 0 -> destroyed

        private static void Deal(CardInstance src, CardInstance tgt, int amount, IEventBus bus)
            => CombatMath.DamageMonster(src, tgt, amount, bus);
    }
}
