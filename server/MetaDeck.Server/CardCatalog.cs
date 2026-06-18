using System.Collections.Generic;
using System.IO;
using MetaDeck.Data;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Server
{
    /// <summary>
    /// Loads the server's card database (CardDef POCOs) from JSON, or falls back to a small built-in
    /// set. In production this JSON is exported from the Unity CardDefinition assets.
    /// </summary>
    public static class CardCatalog
    {
        public static List<CardDef> Load(string path)
        {
            if (!string.IsNullOrEmpty(path) && File.Exists(path))
            {
                var list = ProtocolJson.Deserialize<List<CardDef>>(File.ReadAllText(path));
                if (list != null && list.Count > 0) return list;
            }
            return Default();
        }

        public static List<CardDef> Default() => new()
        {
            new CardDef { cardId = "grunt",   displayName = "Grunt",   type = CardType.Monster, cost = 1, baseAttack = 2, baseHealth = 1, archetypes = new[] { "Aggro" } },
            new CardDef { cardId = "scout",   displayName = "Scout",   type = CardType.Monster, cost = 2, baseAttack = 2, baseHealth = 3, keywords = new[] { Keyword.Rush }, archetypes = new[] { "Aggro" } },
            new CardDef { cardId = "bruiser", displayName = "Bruiser", type = CardType.Monster, cost = 3, baseAttack = 3, baseHealth = 4, keywords = new[] { Keyword.Guard }, archetypes = new[] { "Control" } },
            new CardDef { cardId = "sniper",  displayName = "Sniper",  type = CardType.Monster, cost = 4, baseAttack = 5, baseHealth = 2, archetypes = new[] { "Control" } },
        };

        /// <summary>Build a deck of <paramref name="size"/> cards by cycling through the catalog.</summary>
        public static List<CardDef> BuildDeck(IReadOnlyList<CardDef> catalog, int size)
        {
            var deck = new List<CardDef>(size);
            for (int i = 0; i < size; i++) deck.Add(catalog[i % catalog.Count]);
            return deck;
        }
    }
}
