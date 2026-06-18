using System;
using System.Collections.Generic;
using System.Text;
using MetaDeck.Rules;
using MetaDeck.Data;

namespace MetaDeck.UI
{
    /// <summary>
    /// Converts EffectDefinition arrays into readable rules text.
    /// Central registry keeps this scalable.
    /// </summary>
    public static class EffectText
    {
        // Main entrypoint
        public static string BuildCardText(CardDef def)
        {
            if (def.effects == null || def.effects.Length == 0) return string.Empty;

            var lines = new List<string>(def.effects.Length);
            foreach (var e in def.effects)
            {
                var line = ToRulesLine(def, e);
                if (!string.IsNullOrWhiteSpace(line))
                    lines.Add(line);
            }

            // Join with newlines (your UI already uses multi-line)
            return string.Join("\n", lines);
        }

        // Registry from effect type => formatter
        private static readonly Dictionary<EffectType, Func<CardDef, EffectDefinition, string>> _formatters
            = new()
            {
                { EffectType.Draw, (card, e) => $"Draw {Plural(e.amount, "card")}." },

                { EffectType.DealDamage, (card, e) =>
                    $"Deal {e.amount} damage to {Target(e.targeting, card)}{CondSuffix(e.condition)}."
                },

                { EffectType.Buff, (card, e) =>
                    // Assuming Buff means +X/+X using amount. If your Buff is +X/+X, keep it.
                    // If Buff is only +X HP or something, split into BuffAttack/BuffHealth types.
                    $"Give {Target(e.targeting, card)} +{e.amount}/+{e.amount}{CondSuffix(e.condition)}."
                },

                { EffectType.Silence, (card, e) =>
                    $"Silence {Target(e.targeting, card)}{CondSuffix(e.condition)}."
                },

                { EffectType.DestroyDamaged, (card, e) =>
                    $"Destroy a damaged {Target(e.targeting, card)}."
                },

                { EffectType.ReviveFromGraveyard, (card, e) =>
                    $"Revive {Target(e.targeting, card)}."
                },

                { EffectType.ReturnFromGraveyardToHand, (card, e) =>
                    $"Return {Target(e.targeting, card)} to your hand."
                },

                { EffectType.GrantKeywordThisTurn, (card, e) =>
                    $"{Target(e.targeting, card)} gains {KeywordName(e.keyword)} this turn{CondSuffix(e.condition)}."
                },

                { EffectType.RemoveKeywordThisTurn, (card, e) =>
                    $"{Target(e.targeting, card)} loses {KeywordName(e.keyword)} this turn{CondSuffix(e.condition)}."
                },

                { EffectType.BuffAttackThisTurn, (card, e) =>
                    $"Give {Target(e.targeting, card)} +{e.amount} ATK this turn{CondSuffix(e.condition)}."
                },

                { EffectType.DebuffAttackThisCombat, (card, e) =>
                    $"{Target(e.targeting, card)} gets -{e.amount} ATK this combat."
                },

                { EffectType.Heal, (card, e) =>
                    $"Restore {e.amount} Health to {Target(e.targeting, card)}."
                },

                { EffectType.BuffAllFriendlyMonsters, (card, e) =>
                    $"Give your monsters +{e.amount}/+{e.amount}."
                },

                { EffectType.DealDamageAllEnemyMonsters, (card, e) =>
                    $"Deal {e.amount} damage to all enemy monsters."
                },

                { EffectType.DiscardRandom, (card, e) =>
                    $"{Target(e.targeting, card)} discards {Plural(e.amount, "card")} at random."
                },

                { EffectType.ShuffleGraveyardIntoDeck, (card, e) =>
                    $"Shuffle your graveyard into your deck."
                },

                { EffectType.RevealOpponentHand, (card, e) =>
                    $"Reveal {Target(e.targeting, card)} hand."
                },

                { EffectType.GainMaxBandwidthNextTurn, (card, e) =>
                    $"Gain +{e.amount} Max Bandwidth next turn."
                },

                // If you still have Nitro-specific:
                { EffectType.GainNitro, (card, e) =>
                    $"Gain {Plural(e.amount, "Nitro")}."
                },

                { EffectType.Generate, (card, e) =>
                    $"Generate {e.amount} Bandwidth this turn."
                },

                { EffectType.SpendNitroForBuff, (card, e) =>
                    $"Give {Target(e.targeting, card)} +{e.amount}/+{e.amount} (spends 1 Nitro; +{System.Math.Max(1, e.amount / 2)}/+{System.Math.Max(1, e.amount / 2)} without Nitro)."
                },

                { EffectType.GainXPCounter, (card, e) =>
                    $"Put {Plural(e.amount, "XP counter")} on {Target(e.targeting, card)}."
                },

                { EffectType.SummonToken, (card, e) =>
                    $"Summon {Plural(System.Math.Max(1, e.amount), "1/1 Citizen")}."
                },

                { EffectType.Equip, (card, e) =>
                    e.keyword == Keyword.None
                        ? $"Equip {Target(e.targeting, card)} with +{e.amount}/+{e.amount}."
                        : $"Equip {Target(e.targeting, card)} with +{e.amount}/+{e.amount} and {KeywordName(e.keyword)}."
                },

                // If you have SwapBoardPositions:
                { EffectType.SwapBoardPositions, (card, e) =>
                    $"Swap two monsters' positions."
                },

                // If you have PreventCombatDamageThisCombat:
                { EffectType.PreventCombatDamageThisCombat, (card, e) =>
                    $"Prevent all combat damage to {Target(e.targeting, card)} this combat."
                },
            };

        public static string ToRulesLine(CardDef card, EffectDefinition e)
        {
            // Unknown effect => fallback
            if (!_formatters.TryGetValue(e.effectType, out var fn))
                return Fallback(card, e);

            return fn(card, e);
        }

        private static string Fallback(CardDef card, EffectDefinition e)
        {
            // Debug-friendly fallback so you can ship while still adding nice text later
            var kw = e.keyword != Keyword.None ? $", keyword={e.keyword}" : "";
            return $"[{e.effectType} amount={e.amount}, target={e.targeting}, cond={e.condition}{kw}]";
        }

        private static string Target(SimpleTargeting t, CardDef card)
        {
            // You mentioned Self — if your targeting enum doesn't include Self,
            // you can still display "this" by using FriendlyMonster + null target selection at runtime.
            // BUT since your JSON includes "Self", ideally you add Self to SimpleTargeting.
            // If you already did, handle it here.

            return t switch
            {
                SimpleTargeting.Self => "this",
                SimpleTargeting.FriendlyMonster => "a friendly monster",
                SimpleTargeting.EnemyMonster => "an enemy monster",
                SimpleTargeting.AnyMonster => "a monster",
                SimpleTargeting.FriendlyPlayer => "you",
                SimpleTargeting.EnemyPlayer => "the enemy",
                SimpleTargeting.AnyPlayer => "a player",
                SimpleTargeting.CardInYourGraveyard => "a card in your graveyard",
                SimpleTargeting.None => "—",
                _ => t.ToString()
            };
        }

        private static string CondSuffix(SimpleCondition c)
        {
            // keep this small; don't overdo conditions until needed
            return c switch
            {
                SimpleCondition.None => "",
                SimpleCondition.TargetMustBeDamaged => " (damaged only)",
                SimpleCondition.AttackedThreeTimesThisTurn => " (if you attacked 3+ times this turn)",
                SimpleCondition.CardsPlayedAtLeast1ThisTurn => " (if you played a card this turn)",
                SimpleCondition.CardsPlayedAtLeast3ThisTurn => " (if you played 3+ cards this turn)",
                SimpleCondition.HealthLessThanOpponent => " (if your HP is below your opponent's)",
                SimpleCondition.FriendlyAttackedThisTurn => " (if you attacked this turn)",
                _ => $" ({c})"
            };
        }

        private static string KeywordName(Keyword k)
        {
            // Use spaces / nicer names than enum identifiers
            return k switch
            {
                Keyword.FirstStrike => "First Strike",
                Keyword.DoubleJump => "Double Jump",
                _ => k.ToString()
            };
        }

        private static string Plural(int n, string noun)
        {
            if (n == 1) return $"1 {noun}";
            return $"{n} {noun}s";
        }
    }
}