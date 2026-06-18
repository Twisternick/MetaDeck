using MetaDeck.Core;
using MetaDeck.Engine.Mutations;
using MetaDeck.Rules.Keywords.Registry;

namespace MetaDeck.Rules.Keywords.Service
{
    public sealed class KeywordService
    {
        private readonly KeywordRegistry _registry;
        private readonly ICardQuery _cards;

        public KeywordService(KeywordRegistry registry, ICardQuery cards)
        {
            _registry = registry;
            _cards = cards;
        }

        public void OnEvent<TEvent>(GameState state, in TEvent e, IGameMutator mutator)
        {
            foreach (var host in _cards.EnumerateKeywordHosts(state))
            {
                // Keywords on this host
                foreach (var k in host.Keywords)
                {
                    foreach (var hook in _registry.GetEventHooks<TEvent>(k))
                        hook.OnEvent(state, host, e, mutator);
                }
            }
        }
    }
}