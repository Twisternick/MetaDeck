using MetaDeck.Rules;

namespace MetaDeck.Data
{
    /// <summary>
    /// Plain, engine-facing card data with NO Unity dependencies. This is what the engine
    /// (CardInstance, effects, rules) operates on. In the editor it is produced from the
    /// <see cref="CardDefinition"/> ScriptableObject via <c>ToCardDef()</c>; on the standalone
    /// server it is deserialized from the JSON card database. Visual-only data (art) is NOT here —
    /// the client maps <see cref="cardId"/> to a sprite separately (CardArtRegistry).
    /// Field names mirror CardDefinition so engine readers (Def.type, Def.effects, …) are unchanged.
    /// </summary>
    public sealed class CardDef
    {
        public string cardId;
        public string displayName;

        public CardType type;
        public int cost;
        public int startingNitro;

        public int baseAttack;
        public int baseHealth;

        public SpeedWindow speedWindow;

        public Keyword[] keywords;
        public EffectDefinition[] effects;

        public string[] archetypes;
    }
}
