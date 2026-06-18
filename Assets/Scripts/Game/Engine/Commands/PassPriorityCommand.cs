using MetaDeck.Core;
using MetaDeck.Events;

namespace MetaDeck.Engine.Commands
{
    public sealed class PassPriorityCommand : IGameCommand
    {
        private readonly GameFlowStateMachine _flow;

        public PassPriorityCommand(GameFlowStateMachine flow)
        {
            _flow = flow;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            // flow will validate phase
            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            string reason;
            _flow.PassPriority(out reason);
        }
    }
}