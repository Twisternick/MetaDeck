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
            return _face
                ? _flow.BeginAttackFace(_attacker, out reason)
                : _flow.BeginAttack(_attacker, _defender, out reason);
        }

        public void Execute(GameState state, IEventBus bus)
        {
            // BeginAttack already opened chain and stored pending action
        }
    }
}