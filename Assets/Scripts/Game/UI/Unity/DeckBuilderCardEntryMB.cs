using System;
using System.Collections.Generic;
using TMPro;
using UnityEngine;
using UnityEngine.UI;
using MetaDeck.Data;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    /// <summary>
    /// One card cell in the deck-builder grid. Shows the card's art/name/cost and how many copies are
    /// currently in the working deck, with add/remove buttons. Instantiated per card by DeckBuilderMB,
    /// which supplies the add/remove callbacks. Assign the child UI fields on the prefab.
    /// </summary>
    public sealed class DeckBuilderCardEntryMB : MonoBehaviour
    {
        [SerializeField] private Image art;
        [SerializeField] private TMP_Text nameText;
        [SerializeField] private TMP_Text costText;
        [SerializeField] private TMP_Text attackText;    // monsters only
        [SerializeField] private TMP_Text healthText;    // monsters only
        [SerializeField] private TMP_Text descriptionText; // keywords + effect rules text
        [SerializeField] private TMP_Text countText;     // "x2" when in the deck
        [SerializeField] private Button addButton;        // clicking the cell/+ adds a copy
        [SerializeField] private Button removeButton;     // optional "-" to remove a copy

        public string CardId { get; private set; }

        private Action<string> _onAdd;
        private Action<string> _onRemove;

        public void Bind(CardDefinition def, Action<string> onAdd, Action<string> onRemove)
        {
            CardId = def.cardId;
            _onAdd = onAdd;
            _onRemove = onRemove;

            if (nameText != null) nameText.text = def.displayName;
            if (costText != null) costText.text = def.cost.ToString();
            if (art != null)
            {
                art.sprite = def.artSprite;
                art.enabled = def.artSprite != null;
            }

            // Stats are only meaningful for monsters; blank them for spells/traps.
            bool isMonster = def.type == CardType.Monster;
            if (attackText != null) attackText.text = isMonster ? def.baseAttack.ToString() : "";
            if (healthText != null) healthText.text = isMonster ? def.baseHealth.ToString() : "";

            if (descriptionText != null) descriptionText.text = BuildDescription(def);

            if (addButton != null) addButton.onClick.AddListener(() => _onAdd?.Invoke(CardId));

            // Only wire a remove button that is genuinely SEPARATE from the add button. If the same
            // Button is assigned to both, one click would fire add+remove (net zero, nothing happens).
            if (removeButton != null && removeButton != addButton)
                removeButton.onClick.AddListener(() => _onRemove?.Invoke(CardId));

            SetCount(0);
        }

        // Bold keyword list + effect rules text, matching the in-match card view (CardUI/CardViewMB).
        private static string BuildDescription(CardDefinition def)
        {
            string keywordLine = "";
            if (def.keywords != null)
            {
                var named = new List<string>();
                foreach (var k in def.keywords)
                    if (k != Keyword.None) named.Add(k.ToString());
                if (named.Count > 0) keywordLine = "<b>" + string.Join(", ", named) + "</b>";
            }

            string body = MetaDeck.UI.EffectText.BuildCardText(def.ToCardDef());

            if (string.IsNullOrEmpty(keywordLine)) return body;
            if (string.IsNullOrEmpty(body)) return keywordLine;
            return keywordLine + "\n" + body;
        }

        public void SetCount(int n)
        {
            if (countText != null) countText.text = n > 0 ? $"x{n}" : "";

            // Grey the remove button out at 0 rather than SetActive(false): if the remove button was
            // mis-assigned to the card root, deactivating it would hide the whole cell.
            if (removeButton != null && removeButton != addButton)
                removeButton.interactable = n > 0;
        }

        /// <summary>Show/hide this cell (used by the builder's text search filter).</summary>
        public void SetVisible(bool visible)
        {
            if (gameObject.activeSelf != visible) gameObject.SetActive(visible);
        }

        private void OnDestroy()
        {
            if (addButton != null) addButton.onClick.RemoveAllListeners();
            if (removeButton != null) removeButton.onClick.RemoveAllListeners();
        }
    }
}
