using System;
using System.Collections.Generic;
using MetaDeck.Data;

namespace MetaDeck.Server
{
    /// <summary>
    /// Builds a player's match deck from the catalog: an explicit list of card ids (a player-built
    /// deck), a random selection from a requested archetype, or — if neither is given — a random
    /// archetype with a random selection of its cards. Validation is by membership in the catalog.
    /// </summary>
    public static class DeckService
    {
        public static List<CardDef> Build(IReadOnlyList<CardDef> catalog, string[] requestedIds,
                                          string archetype, int size, Random rng)
        {
            // 1) Explicit player-built deck (ids filtered to those the server actually knows).
            if (requestedIds != null && requestedIds.Length > 0)
            {
                var byId = new Dictionary<string, CardDef>(StringComparer.OrdinalIgnoreCase);
                foreach (var c in catalog)
                    if (c?.cardId != null) byId[c.cardId] = c;

                var deck = new List<CardDef>(requestedIds.Length);
                foreach (var id in requestedIds)
                    if (id != null && byId.TryGetValue(id, out var cd)) deck.Add(cd);

                if (deck.Count > 0) return deck;
            }

            // 2) Random selection from an archetype (chosen, or random if none specified).
            return RandomArchetypeDeck(catalog, archetype, size, rng);
        }

        public static List<CardDef> RandomArchetypeDeck(IReadOnlyList<CardDef> catalog, string archetype,
                                                        int size, Random rng)
        {
            var pool = new List<CardDef>();

            if (!string.IsNullOrEmpty(archetype))
                foreach (var c in catalog)
                    if (HasArchetype(c, archetype)) pool.Add(c);

            if (pool.Count == 0)
            {
                var archetypes = CollectArchetypes(catalog);
                if (archetypes.Count > 0)
                {
                    var pick = archetypes[rng.Next(archetypes.Count)];
                    foreach (var c in catalog)
                        if (HasArchetype(c, pick)) pool.Add(c);
                }
            }

            if (pool.Count == 0) pool = new List<CardDef>(catalog); // fallback: whole catalog

            var deck = new List<CardDef>(size);
            if (pool.Count == 0) return deck;
            for (int i = 0; i < size; i++) deck.Add(pool[rng.Next(pool.Count)]);
            return deck;
        }

        private static bool HasArchetype(CardDef c, string archetype)
        {
            if (c?.archetypes == null) return false;
            foreach (var a in c.archetypes)
                if (string.Equals(a, archetype, StringComparison.OrdinalIgnoreCase)) return true;
            return false;
        }

        private static List<string> CollectArchetypes(IReadOnlyList<CardDef> catalog)
        {
            var set = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            foreach (var c in catalog)
                if (c?.archetypes != null)
                    foreach (var a in c.archetypes)
                        if (!string.IsNullOrEmpty(a)) set.Add(a);
            return new List<string>(set);
        }
    }
}
