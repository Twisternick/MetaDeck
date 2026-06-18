using System.Collections.Generic;
using MetaDeck.Core;

namespace MetaDeck.Rules.Keywords.Service
{
    public interface ICardQuery
    {
        IEnumerable<CardInstance> EnumerateKeywordHosts(GameState state);
    }
}