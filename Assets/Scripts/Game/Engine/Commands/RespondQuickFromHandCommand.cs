using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Effects;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine.Commands
{
    public sealed class RespondQuickFromHandCommand : IGameCommand
    {
        private readonly GameFlowStateMachine _flow;
        private readonly CardInstance _card;
        private readonly TargetSpec _target;

        public RespondQuickFromHandCommand(GameFlowStateMachine flow, CardInstance card, TargetSpec target)
        {
            _flow = flow;
            _card = card;
            _target = target;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            if (_flow == null)
            {
                reason = "Flow missing.";
                return false;
            }

            if (_card == null)
            {
                reason = "Card missing.";
                return false;
            }

            if (_flow.Phase != GamePhase.ChainResponse)
            {
                reason = "Not in chain response.";
                return false;
            }

            // must have priority
            if (_flow.PriorityPlayer != _card.Owner)
            {
                reason = "You do not have priority.";
                return false;
            }

            // must be in hand and quick
            if (_card.Zone != Zone.Hand)
            {
                reason = "Quick response must be from hand (MVP).";
                return false;
            }

            if (_card.Def.speedWindow != SpeedWindow.Quick)
            {
                reason = "Card is not Quick.";
                return false;
            }

            // cost policy: Quick cards cost their CurrentCost (or restrict to <=1)
            var p = state.GetPlayer(_card.Owner);
            if (_card.CurrentCost > 1)
            {
                reason = "Quick responses must cost 0-1 (hand trap policy).";
                return false;
            }

            if (p.Bandwidth < _card.CurrentCost)
            {
                reason = "Not enough Bandwidth.";
                return false;
            }

            // must have an effect to push
            if (_card.Def.effects == null || _card.Def.effects.Length == 0)
            {
                reason = "Card has no effects.";
                return false;
            }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            var p = state.GetPlayer(_card.Owner);

            // Pay bandwidth for response (recommended even for hand traps)
            p.Bandwidth -= _card.CurrentCost;

            // Resolve effect data → effect instance
            EffectDefinition def = _card.Def.effects[0];
            IEffect fx = EffectFactory.Create(def);

            // Push to chain via flow (enforces depth + per-chain limit)
            string reason;
            if (!_flow.AddChainItem(_card, fx, _target, out reason))
            {
                // If it failed unexpectedly, refund
                p.Bandwidth += _card.CurrentCost;
                return;
            }

            // Move the card to graveyard immediately as a "used response"
            // (You can change later: some traps might persist, etc.)
            // This uses engine's ZoneService; we can safely call it here:
            // NOTE: flow doesn't expose engine, so we move directly via state zones.
            // Preferred: call through controller helper.
            // For now: do a minimal move via ZoneService:
            var zones = new MetaDeck.Engine.ZoneService();
            zones.Move(state, _card, Zone.Hand, Zone.Graveyard, bus);

            bus.Publish(new CardPlayed(_card, Zone.Hand));
        }
    }
}