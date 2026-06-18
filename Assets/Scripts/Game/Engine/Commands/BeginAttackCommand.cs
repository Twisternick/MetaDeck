using MetaDeck.Core;
using MetaDeck.Events;

namespace MetaDeck.Engine.Commands
{
    public sealed class BeginAttackCommand : IGameCommand
    {
        private readonly GameFlowStateMachine _flow;
        private readonly CardInstance _attacker;
        private readonly CardInstance _defender;   // null => attack the opponent player (face)
        private readonly bool _face;

        /// <summary>Attack an enemy monster.</summary>
        public BeginAttackCommand(GameFlowStateMachine flow, CardInstance attacker, CardInstance defender)
        {
            _flow = flow;
            _attacker = attacker;
            _defender = defender;
            _face = false;
        }

        /// <summary>Attack the opponent player directly (face).</summary>
        public BeginAttackCommand(GameFlowStateMachine flow, CardInstance attacker)
        {
            _flow = flow;
            _attacker = attacker;
            _defender = null;
            _face = true;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            if (_flow.Phase != GamePhase.Main)
            {
                reason = "Cannot start an attack outside Main phase.";
                return false;
            }

            return _face
                ? CombatRules.CanAttackFace(state, _attacker, out reason)
                : CombatRules.CanAttackMonster(state, _attacker, _defender, out reason);
        }

        public void Execute(GameState state, IEventBus bus)
        {
            // Resolve immediately (no chain window); phase stays Main so the player can keep acting.
            if (_face) _flow.ResolveFaceAttackNow(_attacker);
            else _flow.ResolveAttackNow(_attacker, _defender);
        }
    }
}