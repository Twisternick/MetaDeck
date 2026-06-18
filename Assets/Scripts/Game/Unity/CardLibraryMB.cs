using System.Collections.Generic;
using MetaDeck.Data;
using UnityEngine;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Populates <see cref="MetaDeck.Presentation.CardLibrary"/> at startup from the project's
    /// CardDefinition assets, so the networked client can resolve card art/text/name by cardId.
    /// Assign your cards in the Inspector and/or point at a Resources subfolder. Runs early.
    /// </summary>
    [DefaultExecutionOrder(-100)]
    public sealed class CardLibraryMB : MonoBehaviour
    {
        [Tooltip("All card definitions the client may need to display.")]
        [SerializeField] private List<CardDefinition> cards = new();

        [Tooltip("Optional: also load every CardDefinition under Resources/<this path>.")]
        [SerializeField] private string resourcesPath = "";

        private void Awake()
        {
            MetaDeck.Presentation.CardLibrary.Clear();

            foreach (var c in cards)
                MetaDeck.Presentation.CardLibrary.Register(c);

            if (!string.IsNullOrEmpty(resourcesPath))
                foreach (var c in Resources.LoadAll<CardDefinition>(resourcesPath))
                    MetaDeck.Presentation.CardLibrary.Register(c);

            Debug.Log($"[CardLibrary] {MetaDeck.Presentation.CardLibrary.Count} cards registered.");
        }
    }
}
