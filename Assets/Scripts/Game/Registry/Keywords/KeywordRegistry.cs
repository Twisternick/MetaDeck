using System;
using System.Collections.Generic;
using MetaDeck.Rules;
using MetaDeck.Rules.Keywords.Hooks;

namespace MetaDeck.Rules.Keywords.Registry
{
    public sealed class KeywordRegistry
    {
        private readonly Dictionary<Keyword, List<IKeywordHandler>> _handlers = new();

        public void Register(IKeywordHandler handler)
        {
            if (!_handlers.TryGetValue(handler.Keyword, out var list))
            {
                list = new List<IKeywordHandler>();
                _handlers.Add(handler.Keyword, list);
            }

            list.Add(handler);
        }

        public IEnumerable<IKeywordEventHook<TEvent>> GetEventHooks<TEvent>(Keyword keyword)
        {
            MetaDeck.Diagnostics.GameLog.Debug($"Getting event hooks for keyword {keyword} and event {typeof(TEvent).Name}");
            if (!_handlers.TryGetValue(keyword, out var list))
                yield break;

            for (int i = 0; i < list.Count; i++)
            {
                if (list[i] is IKeywordEventHook<TEvent> hook)
                    yield return hook;
            }
        }
    }
}