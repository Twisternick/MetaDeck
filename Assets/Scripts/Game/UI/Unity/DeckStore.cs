using System;
using System.Collections.Generic;
using UnityEngine;

namespace MetaDeck.Unity
{
    [Serializable]
    public sealed class DeckData
    {
        public string name;
        public List<string> cardIds = new();
    }

    [Serializable]
    internal sealed class DeckCollection
    {
        public List<DeckData> decks = new();
        public string selected; // name of the deck used for matchmaking
    }

    /// <summary>
    /// Local persistence for player-built decks (named lists of card ids), saved to PlayerPrefs as JSON.
    /// Entirely client-side and offline — no server connection needed to build or store decks. The
    /// "selected" deck is the one handed to MetaDeckNetClientMB.deckCardIds when matchmaking starts.
    /// </summary>
    public static class DeckStore
    {
        private const string Key = "metadeck.decks.v1";

        private static DeckCollection _cache;
        private static DeckCollection C => _cache ??= LoadInternal();

        private static DeckCollection LoadInternal()
        {
            var json = PlayerPrefs.GetString(Key, "");
            if (string.IsNullOrEmpty(json)) return new DeckCollection();
            try { return JsonUtility.FromJson<DeckCollection>(json) ?? new DeckCollection(); }
            catch { return new DeckCollection(); }
        }

        private static void Persist()
        {
            PlayerPrefs.SetString(Key, JsonUtility.ToJson(C));
            PlayerPrefs.Save();
        }

        public static IReadOnlyList<DeckData> Decks => C.decks;

        public static DeckData Get(string name)
            => string.IsNullOrEmpty(name) ? null : C.decks.Find(d => d.name == name);

        /// <summary>Create or overwrite a named deck, and mark it as the selected deck.</summary>
        public static void Save(string name, IEnumerable<string> cardIds)
        {
            if (string.IsNullOrEmpty(name)) return;
            var deck = Get(name);
            if (deck == null) { deck = new DeckData { name = name }; C.decks.Add(deck); }
            deck.cardIds = new List<string>(cardIds);
            C.selected = name;
            Persist();
        }

        public static void Delete(string name)
        {
            C.decks.RemoveAll(d => d.name == name);
            if (C.selected == name) C.selected = null;
            Persist();
        }

        public static string SelectedName
        {
            get => C.selected;
            set { C.selected = value; Persist(); }
        }

        public static DeckData Selected => Get(C.selected);

        /// <summary>The selected deck's card ids, or null if none is selected (server then picks one).</summary>
        public static string[] SelectedCardIds()
        {
            var d = Selected;
            return (d != null && d.cardIds.Count > 0) ? d.cardIds.ToArray() : null;
        }
    }
}
