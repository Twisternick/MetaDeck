using System.Collections.Generic;
using MetaDeck.Data;
using UnityEngine;

namespace MetaDeck.Presentation
{
    /// <summary>
    /// Client-side card database: cardId -> authoring <see cref="CardDefinition"/> (name, art, effects).
    /// The server sends only dynamic per-instance state (CardDto); the client looks up static/visual
    /// card data here by cardId. Populated at startup by CardLibraryMB.
    /// </summary>
    public static class CardLibrary
    {
        private static readonly Dictionary<string, CardDefinition> _defs = new();

        public static void Register(CardDefinition def)
        {
            if (def != null && !string.IsNullOrEmpty(def.cardId)) _defs[def.cardId] = def;
        }

        public static CardDefinition Get(string cardId)
            => cardId != null && _defs.TryGetValue(cardId, out var d) ? d : null;

        public static Sprite Art(string cardId)
        {
            var d = Get(cardId);
            return d != null ? d.artSprite : null;
        }

        public static int Count => _defs.Count;
        public static void Clear() => _defs.Clear();

        /// <summary>All registered cards, for UI like the deck builder. Order is registration order.</summary>
        public static IEnumerable<CardDefinition> All => _defs.Values;
    }
}
