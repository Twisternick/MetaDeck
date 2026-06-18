using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine.Commands
{
    public sealed class AttackCommand : IGameCommand
    {
        private readonly CardInstance _attacker;
        private readonly CardInstance _defender;
        private readonly CombatResolver _combat;
        private readonly CleanupResolver _cleanup;

        public AttackCommand(CardInstance attacker, CardInstance defender, CombatResolver combat, CleanupResolver cleanup)
        {
            _attacker = attacker;
            _defender = defender;
            _combat = combat;
            _cleanup = cleanup;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            if (state.ActivePlayer != _attacker.Owner)
            {
                reason = "Not your turn.";
                return false;
            }

            if (_attacker.IsDestroyed || _defender.IsDestroyed)
            {
                reason = "Invalid attacker/defender.";
                return false;
            }

            if (_attacker.Zone != MetaDeck.Rules.Zone.Board || _defender.Zone != MetaDeck.Rules.Zone.Board)
            {
                reason = "Attacker/defender must be on board.";
                return false;
            }

            if(_attacker.SummonedTurn == state.TurnNumber && !_attacker.HasKeyword(Keyword.Rush))
            {
                reason = "Attacker has summoning sickness.";
                return false;
            }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            // Open chain window for hand traps, etc.
            bus.Publish(new ChainOpened(state.ActivePlayer));

            // In a full implementation, you'd allow responses here before resolving.
            // For baseline: resolve combat immediately.
            _combat.ResolveAttack(state, _attacker, _defender, bus);
            _cleanup.CleanupDeaths(state, bus);
        }
    }
}