using UnityEngine;
using MetaDeck.Rules;

namespace MetaDeck.Data
{
    [CreateAssetMenu(menuName = "MetaDeck/Card")]
    public class CardDefinition : ScriptableObject
    {
        public string cardId;
        public string displayName;

        public CardType type;
        public int cost;

        public int startingNitro;

        // Monster stats
        public int baseAttack;
        public int baseHealth;

        public SpeedWindow speedWindow;

        public Keyword[] keywords;
        public EffectDefinition[] effects;

        public string[] archetypes; // e.g. "Racing", "Horror"
        public Sprite artSprite; // or Texture if using RawImage

        /// <summary>
        /// Project this authoring asset into the pure, engine-facing <see cref="CardDef"/> POCO.
        /// Art (<see cref="artSprite"/>) is intentionally excluded — it's looked up by cardId on the
        /// client (CardArtRegistry), keeping the engine free of Unity types.
        /// </summary>
        public CardDef ToCardDef()
        {
            return new CardDef
            {
                cardId = cardId,
                displayName = displayName,
                type = type,
                cost = cost,
                startingNitro = startingNitro,
                baseAttack = baseAttack,
                baseHealth = baseHealth,
                speedWindow = speedWindow,
                keywords = keywords,
                effects = effects,
                archetypes = archetypes
            };
        }
    }
}