using System.Collections.Generic;
using System.Text;
using TMPro;
using UnityEngine;
using UnityEngine.Events;
using UnityEngine.UI;
using MetaDeck.Data;
using MetaDeck.Presentation;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Deck-builder UI (fully offline — uses the client-side CardLibrary). Builds a grid of every
    /// registered card, lets you add/remove copies into a working deck, validates against the deck-size
    /// and per-card copy rules, and saves/loads named decks via DeckStore. "Use Deck" stores the deck,
    /// marks it selected, pushes it onto MetaDeckNetClientMB.deckCardIds, and raises onDeckChosen so the
    /// main menu can return. All UI references are assigned in the Inspector.
    /// </summary>
    public sealed class DeckBuilderMB : MonoBehaviour
    {
        [Header("Refs")]
        [SerializeField] private MetaDeckNetClientMB netClient;

        [Header("Card grid")]
        [Tooltip("Parent (with a Grid/Vertical layout) that card cells are instantiated under.")]
        [SerializeField] private Transform gridContainer;
        [SerializeField] private DeckBuilderCardEntryMB entryPrefab;
        [Tooltip("Optional: filters the grid by display-name substring as you type.")]
        [SerializeField] private TMP_InputField searchInput;

        [Header("Deck panel")]
        [SerializeField] private TMP_Text summaryText;       // "Deck: 17 / 20"
        [SerializeField] private TMP_Text deckListText;      // multiline "2x Sniper\n1x Bruiser…"
        [SerializeField] private TMP_Text validationText;    // problems, or "Ready"
        [SerializeField] private TMP_InputField deckNameInput;
        [SerializeField] private TMP_Dropdown loadDropdown;  // saved decks

        [Header("Buttons")]
        [SerializeField] private Button saveButton;
        [SerializeField] private Button deleteButton;
        [SerializeField] private Button clearButton;
        [SerializeField] private Button useDeckButton;       // commit + select + leave
        [SerializeField] private Button backButton;          // leave without committing

        [Header("Rules")]
        [Tooltip("Required number of cards in a valid deck.")]
        [SerializeField] private int targetDeckSize = 20;
        [Tooltip("Max copies of a single card. 0 = unlimited (matches the server's default).")]
        [SerializeField] private int maxCopiesPerCard = 0;

        [Header("Events")]
        [Tooltip("Raised when the player commits a valid deck via Use Deck.")]
        public UnityEvent onDeckChosen;
        [Tooltip("Raised when Back is pressed (no deck committed) — wire to MainMenuMB.ShowMainMenu.")]
        public UnityEvent onBack;

        private readonly Dictionary<string, int> _counts = new();
        private readonly Dictionary<string, DeckBuilderCardEntryMB> _entries = new();
        private bool _gridBuilt;

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();

            // A zero/negative size would make every Add fail with "deck full"; fall back to a sane value.
            if (targetDeckSize <= 0)
            {
                Debug.LogWarning("[DeckBuilder] targetDeckSize was <= 0; defaulting to 20.");
                targetDeckSize = 20;
            }
        }

        private void OnEnable()
        {
            BuildGridOnce();
            RefreshLoadDropdown();

            // Start from the currently-selected deck if there is one.
            LoadIntoWorkingSet(DeckStore.Selected);
            ApplySearch(searchInput != null ? searchInput.text : null);

            if (saveButton != null) saveButton.onClick.AddListener(SaveCurrent);
            if (deleteButton != null) deleteButton.onClick.AddListener(DeleteSelected);
            if (clearButton != null) clearButton.onClick.AddListener(ClearWorkingSet);
            if (useDeckButton != null) useDeckButton.onClick.AddListener(UseDeck);
            if (backButton != null) backButton.onClick.AddListener(Back);
            if (searchInput != null) searchInput.onValueChanged.AddListener(ApplySearch);
            if (loadDropdown != null) loadDropdown.onValueChanged.AddListener(OnLoadDropdownChanged);
        }

        private void OnDisable()
        {
            if (saveButton != null) saveButton.onClick.RemoveListener(SaveCurrent);
            if (deleteButton != null) deleteButton.onClick.RemoveListener(DeleteSelected);
            if (clearButton != null) clearButton.onClick.RemoveListener(ClearWorkingSet);
            if (useDeckButton != null) useDeckButton.onClick.RemoveListener(UseDeck);
            if (backButton != null) backButton.onClick.RemoveListener(Back);
            if (searchInput != null) searchInput.onValueChanged.RemoveListener(ApplySearch);
            if (loadDropdown != null) loadDropdown.onValueChanged.RemoveListener(OnLoadDropdownChanged);
        }

        private void BuildGridOnce()
        {
            if (_gridBuilt) return;
            if (gridContainer == null || entryPrefab == null)
            {
                Debug.LogError("[DeckBuilder] gridContainer/entryPrefab not assigned.");
                return;
            }
            if (CardLibrary.Count == 0)
                Debug.LogWarning("[DeckBuilder] CardLibrary is empty — is CardLibraryMB in the scene and populated?");

            foreach (var def in CardLibrary.All)
            {
                if (def == null || string.IsNullOrEmpty(def.cardId)) continue;
                var entry = Instantiate(entryPrefab, gridContainer);
                entry.Bind(def, Add, Remove);
                _entries[def.cardId] = entry;
            }
            _gridBuilt = true;
        }

        private int CountOf(string id) => _counts.TryGetValue(id, out var n) ? n : 0;
        private int Total() { int t = 0; foreach (var n in _counts.Values) t += n; return t; }

        private void Add(string id)
        {
            if (Total() >= targetDeckSize) { SetValidation($"Deck is full ({targetDeckSize})."); return; }
            int cur = CountOf(id);
            if (maxCopiesPerCard > 0 && cur >= maxCopiesPerCard)
            {
                SetValidation($"Max {maxCopiesPerCard} copies of a card.");
                return;
            }
            _counts[id] = cur + 1;
            RefreshEntry(id);
            RefreshSummary();
        }

        private void Remove(string id)
        {
            int cur = CountOf(id);
            if (cur <= 0) return;
            if (cur == 1) _counts.Remove(id); else _counts[id] = cur - 1;
            RefreshEntry(id);
            RefreshSummary();
        }

        private void ClearWorkingSet()
        {
            var ids = new List<string>(_counts.Keys);
            _counts.Clear();
            foreach (var id in ids) RefreshEntry(id);
            RefreshSummary();
        }

        private void LoadIntoWorkingSet(DeckData deck)
        {
            _counts.Clear();
            if (deck != null)
            {
                foreach (var id in deck.cardIds)
                    if (_entries.ContainsKey(id)) // ignore ids no longer in the library
                        _counts[id] = CountOf(id) + 1;
                if (deckNameInput != null) deckNameInput.text = deck.name;
            }
            foreach (var id in _entries.Keys) RefreshEntry(id);
            RefreshSummary();
        }

        private void RefreshEntry(string id)
        {
            if (_entries.TryGetValue(id, out var e)) e.SetCount(CountOf(id));
        }

        private void RefreshSummary()
        {
            int total = Total();
            if (summaryText != null) summaryText.text = $"Deck: {total} / {targetDeckSize}";

            if (deckListText != null)
            {
                var sb = new StringBuilder();
                foreach (var kv in _counts)
                {
                    var def = CardLibrary.Get(kv.Key);
                    sb.Append(kv.Value).Append("x ").AppendLine(def != null ? def.displayName : kv.Key);
                }
                deckListText.text = sb.ToString();
            }

            SetValidation(Validate(total));
            if (useDeckButton != null) useDeckButton.interactable = total == targetDeckSize;
        }

        private string Validate(int total)
        {
            if (total < targetDeckSize) return $"Add {targetDeckSize - total} more card(s).";
            if (total > targetDeckSize) return $"Remove {total - targetDeckSize} card(s).";
            return "Ready to play.";
        }

        private void SetValidation(string s) { if (validationText != null) validationText.text = s; }

        // ---- save / load ----

        private void SaveCurrent()
        {
            var name = deckNameInput != null ? deckNameInput.text?.Trim() : null;
            if (string.IsNullOrEmpty(name)) { SetValidation("Enter a deck name to save."); return; }
            DeckStore.Save(name, Flatten());
            RefreshLoadDropdown(name);
            SetValidation($"Saved \"{name}\".");
        }

        private void DeleteSelected()
        {
            var name = deckNameInput != null ? deckNameInput.text?.Trim() : null;
            if (string.IsNullOrEmpty(name)) return;
            DeckStore.Delete(name);
            RefreshLoadDropdown();
            SetValidation($"Deleted \"{name}\".");
        }

        private void RefreshLoadDropdown(string selectName = null)
        {
            if (loadDropdown == null) return;
            loadDropdown.onValueChanged.RemoveListener(OnLoadDropdownChanged);

            loadDropdown.ClearOptions();
            var options = new List<string> { "— Load deck —" };
            foreach (var d in DeckStore.Decks) options.Add(d.name);
            loadDropdown.AddOptions(options);

            int idx = 0;
            if (!string.IsNullOrEmpty(selectName))
                idx = Mathf.Max(0, options.IndexOf(selectName));
            loadDropdown.SetValueWithoutNotify(idx);

            loadDropdown.onValueChanged.AddListener(OnLoadDropdownChanged);
        }

        private void OnLoadDropdownChanged(int index)
        {
            if (index <= 0) return; // the placeholder row
            var name = loadDropdown.options[index].text;
            LoadIntoWorkingSet(DeckStore.Get(name));
        }

        private List<string> Flatten()
        {
            var list = new List<string>();
            foreach (var kv in _counts)
                for (int i = 0; i < kv.Value; i++) list.Add(kv.Key);
            return list;
        }

        private void UseDeck()
        {
            if (Total() != targetDeckSize) { RefreshSummary(); return; }

            // Auto-name unsaved decks so there's always something to select.
            var name = deckNameInput != null ? deckNameInput.text?.Trim() : null;
            if (string.IsNullOrEmpty(name)) name = "My Deck";

            DeckStore.Save(name, Flatten());           // persists + marks selected
            if (deckNameInput != null) deckNameInput.text = name;
            if (netClient != null) netClient.deckCardIds = DeckStore.SelectedCardIds();

            SetValidation($"Using \"{name}\".");
            onDeckChosen?.Invoke();
        }

        // Leave the deck builder without committing the working set.
        private void Back() => onBack?.Invoke();

        // ---- search filter ----

        private void ApplySearch(string query)
        {
            query = query?.Trim();
            bool all = string.IsNullOrEmpty(query);
            foreach (var kv in _entries)
            {
                var def = CardLibrary.Get(kv.Key);
                bool show = all || (def != null && def.displayName != null
                                    && def.displayName.ToLowerInvariant().Contains(query.ToLowerInvariant()));
                kv.Value.SetVisible(show);
            }
        }
    }
}
