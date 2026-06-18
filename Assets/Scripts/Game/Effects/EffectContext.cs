using MetaDeck.Core;
using MetaDeck.Events;

namespace MetaDeck.Effects
{
    public sealed class EffectContext
    {
        public GameState State { get; }
        public IEventBus Bus { get; }
        public CardInstance Source { get; }
        public TargetSpec Target { get; }

        public EffectContext(GameState state, IEventBus bus, CardInstance source, TargetSpec target)
        {
            State = state;
            Bus = bus;
            Source = source;
            Target = target;
        }
    }
}