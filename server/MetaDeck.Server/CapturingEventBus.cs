using System;
using System.Collections.Generic;
using MetaDeck.Events;
using MetaDeck.Protocol;

namespace MetaDeck.Server
{
    /// <summary>
    /// IEventBus decorator that records every published engine event as an <see cref="EventDto"/>
    /// while a capture is active. The server wraps a command's execution in BeginCapture/EndCapture
    /// to collect exactly the events that command produced, for broadcast to clients.
    /// </summary>
    public sealed class CapturingEventBus : IEventBus
    {
        private readonly IEventBus _inner;
        private List<EventDto> _sink;

        public CapturingEventBus(IEventBus inner) => _inner = inner;

        public void BeginCapture(List<EventDto> sink) => _sink = sink;
        public void EndCapture() => _sink = null;

        public void Publish<T>(T evt)
        {
            _inner.Publish(evt);
            if (_sink != null)
            {
                var dto = EventMapper.Map(evt);
                if (dto != null) _sink.Add(dto);
            }
        }

        public void Subscribe<T>(Action<T> handler) => _inner.Subscribe(handler);
        public void Unsubscribe<T>(Action<T> handler) => _inner.Unsubscribe(handler);
    }
}
