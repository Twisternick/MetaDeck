using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Engine;
using MetaDeck.Rules;

namespace MetaDeck.UI
{
    /// <summary>
    /// UI-facing rules queries. This prevents UI from hardcoding rules.
    /// Keep these deterministic and derived only from GameState.
    /// </summary>
    public sealed class RulesQueryService
    {
        public List<int> GetValidSummonSlots(GameState state, PlayerId player, CardInstance monster)
        {
            var result = new List<int>();
            if (monster == null) return result;
            if (monster.Def.type != CardType.Monster) return result;
            if (state.ActivePlayer != player) return result;

            for (int i = 0; i < 5; i++)
            {
                if (state.Board.GetAt(player, i) == null)
                    result.Add(i);
            }
            return result;
        }

        public List<int> GetValidAttackers(GameState state, PlayerId player)
        {
            var result = new List<int>();
            if (state.ActivePlayer != player) return result;

            for (int i = 0; i < 5; i++)
            {
                var c = state.Board.GetAt(player, i);
                if (c != null && c.Def.type == CardType.Monster && !c.IsDestroyed
                    && !CombatRules.HasSummoningSickness(state, c))
                {
                    result.Add(i);
                }
            }
            return result;
        }

        public List<int> GetValidDefenders(GameState state, PlayerId attackerOwner, CardInstance attacker)
        {
            var result = new List<int>();
            if (attacker == null) return result;

            var defenderOwner = state.OpponentOf(attackerOwner);

            // Guard rule: if the defending side has any Guard, only Guards are valid targets.
            // (Shared with the engine via CombatRules so UI highlighting matches enforcement.)
            bool hasGuard = CombatRules.HasGuard(state, defenderOwner);

            for (int i = 0; i < 5; i++)
            {
                var d = state.Board.GetAt(defenderOwner, i);
                if (d == null || d.IsDestroyed) continue;

                if (hasGuard)
                {
                    if (d.HasKeyword(Keyword.Guard))
                        result.Add(i);
                }
                else
                {
                    result.Add(i);
                }
            }

            return result;
        }

        /// <summary>True if <paramref name="attacker"/> may attack the opponent player directly (no Guard up).</summary>
        public bool CanAttackFace(GameState state, CardInstance attacker)
            => CombatRules.CanAttackFace(state, attacker, out _);

        public bool CanPlayFromHand(GameState state, PlayerId player, CardInstance card)
        {
            if (card == null) return false;
            if (state.ActivePlayer != player) return false;

            var p = state.GetPlayer(player);
            return p.Bandwidth >= card.CurrentCost;
        }

        public bool CanRespondQuickFromHand(GameState state, PlayerId player, CardInstance card, bool isInChainWindow, PlayerId priorityPlayer)
        {
            if (!isInChainWindow) return false;
            if (priorityPlayer != player) return false;
            if (card == null) return false;

            // must be quick
            if (card.Def.speedWindow != SpeedWindow.Quick) return false;

            // from hand only for "hand trap" behavior in this MVP
            if (card.Zone != Zone.Hand) return false;

            // per-chain hand trap limiter handled here for UI convenience
            var p = state.GetPlayer(player);
            if (p.HandTrapsUsedThisChain >= 1) return false;

            // cost rule (choose your design):
            // Option 1: Quick cards still cost bandwidth:
            // return p.Bandwidth >= card.CurrentCost;
            // Option 2: Quick cards cost 0/1 only (recommended for hand trap feel):
            return card.CurrentCost <= 1 && p.Bandwidth >= card.CurrentCost;
        }

        public List<object> GetValidTargetsForEffect(GameState state, PlayerId sourceOwner, EffectDefinition effectDef)
        {
            var result = new List<object>();
            if (effectDef == null) return result;

            var enemy = state.OpponentOf(sourceOwner);

            switch (effectDef.targeting)
            {
                case SimpleTargeting.None:
                    // null target allowed
                    result.Add(null);
                    break;

                case SimpleTargeting.EnemyPlayer:
                    result.Add(enemy);
                    break;

                case SimpleTargeting.FriendlyPlayer:
                    result.Add(sourceOwner);
                    break;

                case SimpleTargeting.EnemyMonster:
                    AddMonsters(result, state, enemy, onlyDamaged: effectDef.condition == SimpleCondition.TargetMustBeDamaged);
                    break;

                case SimpleTargeting.FriendlyMonster:
                    AddMonsters(result, state, sourceOwner, onlyDamaged: effectDef.condition == SimpleCondition.TargetMustBeDamaged);
                    break;

                case SimpleTargeting.AnyMonster:
                    AddMonsters(result, state, sourceOwner, onlyDamaged: effectDef.condition == SimpleCondition.TargetMustBeDamaged);
                    AddMonsters(result, state, enemy, onlyDamaged: effectDef.condition == SimpleCondition.TargetMustBeDamaged);
                    break;

                case SimpleTargeting.CardInYourGraveyard:
                    AddGraveyardMonsters(result, state, sourceOwner);
                    break;
            }

            return result;
        }

        private void AddMonsters(List<object> outList, GameState state, PlayerId owner, bool onlyDamaged)
        {
            for (int i = 0; i < 5; i++)
            {
                var m = state.Board.GetAt(owner, i);
                if (m == null || m.IsDestroyed) continue;

                if (onlyDamaged)
                {
                    if (m.GetHealth() < m.GetMaxHealth())
                        outList.Add(m);
                }
                else
                {
                    outList.Add(m);
                }
            }
        }

        private void AddGraveyardMonsters(List<object> outList, GameState state, PlayerId owner)
        {
            var g = state.GetPlayer(owner).Graveyard.Cards;
            for (int i = 0; i < g.Count; i++)
            {
                var c = g[i];
                if (c.Def.type == CardType.Monster)
                    outList.Add(c);
            }
        }

        /// <summary>
        /// Returns true if the game-state condition is satisfied for the given source card.
        /// Effects whose condition is NOT satisfied are silently skipped by EffectRunner.
        /// Conditions handled per-effect (TargetMustBeDamaged) always return true here.
        /// </summary>
        public bool CheckCondition(GameState state, CardInstance source, SimpleCondition condition)
        {
            return condition switch
            {
                SimpleCondition.None => true,
                SimpleCondition.TargetMustBeDamaged => true,    // enforced inside DealDamageEffect.CanActivate
                SimpleCondition.AttackedThreeTimesThisTurn => true, // legacy, handled per-effect
                SimpleCondition.CardsPlayedAtLeast1ThisTurn => state.GetPlayer(source.Owner).CardsPlayedThisTurn >= 1,
                SimpleCondition.CardsPlayedAtLeast3ThisTurn => state.GetPlayer(source.Owner).CardsPlayedThisTurn >= 3,
                SimpleCondition.HasNitroAtLeast1 => state.GetPlayer(source.Owner).Nitro >= 1,
                SimpleCondition.ControlsDistrict => ControlsKeyword(state, source.Owner, Keyword.District),
                SimpleCondition.ControlsStructure => ControlsKeyword(state, source.Owner, Keyword.Structure),
                SimpleCondition.FriendlyBoardAtLeast3 => FriendlyBoardCount(state, source.Owner) >= 3,
                SimpleCondition.FriendlyHasXPCounter => FriendlyHasCounter(state, source.Owner, "XP"),
                SimpleCondition.HealthLessThanOpponent => HealthLessThanOpponent(state, source.Owner),
                SimpleCondition.FriendlyAttackedThisTurn => state.GetPlayer(source.Owner).AttacksThisTurn >= 1,
                _ => true
            };
        }

        private bool ControlsKeyword(GameState state, PlayerId owner, Keyword kw)
        {
            for (int i = 0; i < 5; i++)
            {
                var m = state.Board.GetAt(owner, i);
                if (m != null && !m.IsDestroyed && m.HasKeyword(kw))
                    return true;
            }
            return false;
        }

        private int FriendlyBoardCount(GameState state, PlayerId owner)
        {
            int count = 0;
            for (int i = 0; i < 5; i++)
            {
                var m = state.Board.GetAt(owner, i);
                if (m != null && !m.IsDestroyed) count++;
            }
            return count;
        }

        private bool HealthLessThanOpponent(GameState state, PlayerId owner)
        {
            var p = state.GetPlayer(owner);
            var opp = state.GetPlayer(state.OpponentOf(owner));
            return p.Hp < opp.Hp;
        }

        private bool FriendlyHasCounter(GameState state, PlayerId owner, string key)
        {
            for (int i = 0; i < 5; i++)
            {
                var m = state.Board.GetAt(owner, i);
                if (m != null && !m.IsDestroyed && m.Counters.TryGetValue(key, out int v) && v > 0)
                    return true;
            }
            return false;
        }
    }
}