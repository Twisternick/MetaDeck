using MetaDeck.Core;
using MetaDeck.Engine.Mutations;

namespace MetaDeck.Rules.Keywords.Hooks
{
    /// <summary>
    /// Keyword reacts to a game event. No targeting, no UI, no chain.
    /// </summary>
    public interface IKeywordEventHook<TEvent> : IKeywordHandler
    {
        void OnEvent(GameState state, CardInstance host, in TEvent e, IGameMutator mutator);
    }
}