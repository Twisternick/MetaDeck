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
    }
}