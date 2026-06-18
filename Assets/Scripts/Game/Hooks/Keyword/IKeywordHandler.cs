using MetaDeck.Rules;

namespace MetaDeck.Rules.Keywords.Hooks
{
    public interface IKeywordHandler
    {
        Keyword Keyword { get; }
    }
}