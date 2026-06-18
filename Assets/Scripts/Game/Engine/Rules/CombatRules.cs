using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    /// <summary>
    /// Pure combat-targeting rules. Single source of truth shared by the engine (which ENFORCES them)
    /// and the UI's RulesQueryService (which uses them for highlighting). No Unity dependencies.
    /// </summary>
    public static class CombatRules
    {
        /// <summary>True if the given player controls at least one un-destroyed Guard monster.</summary>
        public static bool HasGuard(GameState state, PlayerId owner)
        {
            for (int i = 0; i < 5; i++)
            {
                var d = state.Board.GetAt(owner, i);
                if (d != null && !d.IsDestroyed && d.HasKeyword(Keyword.Guard))
                    return true;
            }
            return false;
        }

        /// <summary>A monster summoned this turn can't attack unless it has Rush.</summary>
        public static bool HasSummoningSickness(GameState state, CardInstance attacker)
            => attacker.SummonedTurn == state.TurnNumber && !attacker.HasKeyword(Keyword.Rush);

        /// <summary>Attacker-side validity: must be the active player's living, un-sick board monster.</summary>
        public static bool CanAttack(GameState state, CardInstance attacker, out string reason)
        {
            if (attacker == null) { reason = "No attacker."; return false; }
            if (state.ActivePlayer != attacker.Owner) { reason = "Not your turn."; return false; }
            if (attacker.Def.type != CardType.Monster) { reason = "Only monsters can attack."; return false; }
            if (attacker.Zone != Zone.Board) { reason = "Attacker must be on board."; return false; }
            if (attacker.IsDestroyed) { reason = "Attacker is destroyed."; return false; }
            if (HasSummoningSickness(state, attacker)) { reason = "Attacker has summoning sickness."; return false; }
            reason = "";
            return true;
        }

        /// <summary>Can <paramref name="attacker"/> legally attack the enemy monster <paramref name="defender"/>?</summary>
        public static bool CanAttackMonster(GameState state, CardInstance attacker, CardInstance defender, out string reason)
        {
            if (!CanAttack(state, attacker, out reason)) return false;
            if (defender == null) { reason = "No defender."; return false; }
            if (defender.Zone != Zone.Board || defender.IsDestroyed) { reason = "Invalid defender."; return false; }

            var defenderOwner = state.OpponentOf(attacker.Owner);
            if (defender.Owner != defenderOwner) { reason = "Must attack an enemy monster."; return false; }

            // Guard/taunt: if the defending side has a Guard, only Guards are legal targets.
            // DoubleJump attackers can bypass Guard once — they may attack any target.
            if (HasGuard(state, defenderOwner)
                && !defender.HasKeyword(Keyword.Guard)
                && !attacker.HasKeyword(Keyword.DoubleJump))
            {
                reason = "Must attack a Guard monster first.";
                return false;
            }

            reason = "";
            return true;
        }

        /// <summary>Can <paramref name="attacker"/> legally attack the opponent player directly (face)?</summary>
        public static bool CanAttackFace(GameState state, CardInstance attacker, out string reason)
        {
            if (!CanAttack(state, attacker, out reason)) return false;

            var defenderOwner = state.OpponentOf(attacker.Owner);
            // DoubleJump can attack face even through Guard.
            if (HasGuard(state, defenderOwner) && !attacker.HasKeyword(Keyword.DoubleJump))
            {
                reason = "Must attack a Guard monster first.";
                return false;
            }

            reason = "";
            return true;
        }
    }
}
