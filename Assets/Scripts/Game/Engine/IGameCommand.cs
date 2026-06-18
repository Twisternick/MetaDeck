using MetaDeck.Core;
using MetaDeck.Events;

namespace MetaDeck.Engine
{
    public interface IGameCommand
    {
        bool CanExecute(GameState state, out string reason);
        void Execute(GameState state, IEventBus bus);
    }
}