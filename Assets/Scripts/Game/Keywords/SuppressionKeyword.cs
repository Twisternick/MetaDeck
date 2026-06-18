using MetaDeck.Core;
using MetaDeck.Engine;
using MetaDeck.Engine.Mutations;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.Rules.Keywords.Hooks;

namespace MetaDeck.Rules.Keywords.Handlers
{
    /// <summary>
    /// Suppression — when this monster damages an enemy monster, that monster is Suppressed (cannot
    /// attack) through the end of its controller's next turn. CombatRules enforces the can't-attack part.
    /// </summary>
    public sealed class SuppressionKeywordHandler : IKeywordEventHook<DamageDealt>
    {
        public Keyword Keyword => Keyword.Suppression;

        public void OnEvent(GameState state, CardInstance host, in DamageDealt e, IGameMutator mutator)
        {
            if (e.Source != host) return;                    // this monster must be the one dealing damage
            if (e.Target is not CardInstance victim) return; // only monster targets (not player face)
            if (victim.Owner == host.Owner) return;          // enemies only
            if (victim.Def.type != CardType.Monster) return;

            // Their controller's next turn is TurnNumber + 1; suppressed through the end of it.
            victim.Counters[CombatRules.SuppressedUntilTurnKey] = state.TurnNumber + 1;
        }
    }
}
