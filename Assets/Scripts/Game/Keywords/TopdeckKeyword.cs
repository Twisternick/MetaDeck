using MetaDeck.Core;
using MetaDeck.Engine.Mutations;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.Rules.Keywords.Hooks;

namespace MetaDeck.Rules.Keywords.Handlers
{
    /// <summary>
    /// Topdeck — Whenever you draw a card, this gains +1/+1 (permanent).
    /// </summary>
    public sealed class TopdeckKeywordHandler : IKeywordEventHook<CardDrawn>
    {
        public Keyword Keyword => Keyword.Topdeck; // assumes you have this enum value

        public void OnEvent(GameState state, CardInstance host, in CardDrawn e, IGameMutator mutator)
        {
            MetaDeck.Diagnostics.GameLog.Debug($"Topdeck triggered for {host.ToString()} controlled by {host.Owner.ToString()} due to {e.Player.ToString()} drawing a card.");
            // Only buff cards controlled by the drawing player.
            if (host.Owner != e.Player)
                return;

            // Only while on board (recommended default).
            if (host.Zone != Zone.Board)
                return;

            MetaDeck.Diagnostics.GameLog.Debug($"Topdeck is applying +1/+1 to {host.ToString()} because {e.Player.ToString()} drew a card.");

            mutator.AddModifier(host, new StatModifier(
                tag: "Topdeck",
                attackDelta: 1,
                healthDelta: 1,
                duration: ModifierDuration.Permanent,
                sourceInstanceId: host.InstanceId
            ));

            MetaDeck.Diagnostics.GameLog.Debug($"Topdeck has applied +1/+1 to {host.ToString()}. New stats: {host.GetAttack()}/{host.GetHealth()}");
        }
    }
}