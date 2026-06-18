using System.Collections.Generic;
using UnityEngine;

namespace MetaDeck.Presentation
{
    /// <summary>
    /// Client-side map of cardId -> art Sprite. The engine's <see cref="MetaDeck.Data.CardDef"/> POCO
    /// intentionally carries no Unity types, so the UI resolves art by id here. Populated at match start
    /// from the authoring <see cref="MetaDeck.Data.CardDefinition"/> assets (see MatchBootstrapper).
    /// </summary>
    public static class CardArtRegistry
    {
        private static readonly Dictionary<string, Sprite> _art = new();

        public static void Register(string cardId, Sprite sprite)
        {
            if (string.IsNullOrEmpty(cardId)) return;
            _art[cardId] = sprite;
        }

        public static Sprite Resolve(string cardId)
            => (cardId != null && _art.TryGetValue(cardId, out var s)) ? s : null;

        public static void Clear() => _art.Clear();
    }
}
