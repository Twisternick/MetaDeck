using MetaDeck.Rules.Keywords.Handlers;

namespace MetaDeck.Rules.Keywords.Registry
{
    public static class KeywordModule
    {
        public static KeywordRegistry BuildDefaultRegistry()
        {
            var reg = new KeywordRegistry();

            // Register keyword handlers here
            reg.Register(new TopdeckKeywordHandler());
            reg.Register(new SuppressionKeywordHandler());
            reg.Register(new FearKeywordHandler());

            return reg;
        }
    }
}