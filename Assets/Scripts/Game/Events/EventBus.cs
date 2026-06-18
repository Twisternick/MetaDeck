using System;
using System.Collections.Generic;

namespace MetaDeck.Events
{
    public sealed class EventBus : IEventBus
    {
        private readonly Dictionary<Type, Delegate> _handlers = new();

        public void Publish<T>(T evt)
        {
            MetaDeck.Diagnostics.GameLog.Debug($"Publishing event: {typeof(T).Name}");
            if (_handlers.TryGetValue(typeof(T), out var del))
            {
                var action = del as Action<T>;
                action?.Invoke(evt);
            }
        }

        public void Subscribe<T>(Action<T> handler)
        {
            if (_handlers.TryGetValue(typeof(T), out var del))
                _handlers[typeof(T)] = Delegate.Combine(del, handler);
            else
                _handlers[typeof(T)] = handler;
        }

        public void Unsubscribe<T>(Action<T> handler)
        {
            if (!_handlers.TryGetValue(typeof(T), out var del)) return;
            var next = Delegate.Remove(del, handler);
            if (next == null) _handlers.Remove(typeof(T));
            else _handlers[typeof(T)] = next;
        }
    }
}