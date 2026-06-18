using System;
using MetaDeck.Core;
using MetaDeck.Engine.Mutations;
using MetaDeck.Rules.Keywords.Service;

namespace MetaDeck.Events
{
    /// <summary>
    /// Decorator bus: publishes to the inner bus AND routes events into KeywordService.
    /// This ensures keywords trigger from effects, zones, combat, etc. automatically.
    /// </summary>
    public sealed class KeywordRoutingEventBus : IEventBus
    {
        private readonly GameState _state;
        private readonly IEventBus _inner;
        private readonly KeywordService _keywords;
        private readonly IGameMutator _mutator;

        public KeywordRoutingEventBus(
            GameState state,
            IEventBus inner,
            KeywordService keywords,
            IGameMutator mutator)
        {
            _state = state ?? throw new ArgumentNullException(nameof(state));
            _inner = inner ?? throw new ArgumentNullException(nameof(inner));
            _keywords = keywords ?? throw new ArgumentNullException(nameof(keywords));
            _mutator = mutator ?? throw new ArgumentNullException(nameof(mutator));
        }

        public void Publish<T>(T evt)
        {

            MetaDeck.Diagnostics.GameLog.Debug($"KeywordRoutingEventBus received event: {typeof(T).Name}");
            // 1) Publish normally so UI/logging/state listeners see it.
            _inner.Publish(evt);

            // 2) Then allow keywords to react (Topdeck, Lifesteal, etc.)
            _keywords.OnEvent(_state, evt, _mutator);
        }

        public void Subscribe<T>(Action<T> handler)
        {
            _inner.Subscribe(handler);
        }

        public void Unsubscribe<T>(Action<T> handler)
        {
            _inner.Unsubscribe(handler);
        }
    }
}