using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Front-end navigation for the single-scene panel flow: Main Menu ⇄ Deck Builder ⇄ Lobby, then the
    /// live match. Everything before "Play" is offline; the lobby panel (LobbyMB) is what actually talks
    /// to the server. On match start (Welcome) all front-end panels hide; if the opponent leaves we pop
    /// back to the menu. Wire DeckBuilderMB.onDeckChosen to <see cref="ShowMainMenu"/> so committing a
    /// deck returns here. Assign panels/buttons in the Inspector.
    /// </summary>
    public sealed class MainMenuMB : MonoBehaviour
    {
        [Header("Refs")]
        [SerializeField] private MetaDeckNetClientMB netClient;

        [Header("Panels")]
        [SerializeField] private GameObject mainMenuPanel;
        [SerializeField] private GameObject deckBuilderPanel;
        [SerializeField] private GameObject lobbyPanel;

        [Header("Buttons")]
        [SerializeField] private Button playButton;        // -> lobby (uses the selected deck)
        [SerializeField] private Button deckBuilderButton; // -> deck builder
        [SerializeField] private Button quitButton;

        [Header("UI")]
        [SerializeField] private TMP_Text selectedDeckText; // "Deck: My Deck" / "Deck: Random"

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
        }

        private void OnEnable()
        {
            if (netClient != null)
            {
                netClient.OnWelcome += OnMatchStarted;
                netClient.OnOpponentLeft += ShowMainMenu;
            }
            if (playButton != null) playButton.onClick.AddListener(OpenLobby);
            if (deckBuilderButton != null) deckBuilderButton.onClick.AddListener(OpenDeckBuilder);
            if (quitButton != null) quitButton.onClick.AddListener(Quit);

            ShowMainMenu();
        }

        private void OnDisable()
        {
            if (netClient != null)
            {
                netClient.OnWelcome -= OnMatchStarted;
                netClient.OnOpponentLeft -= ShowMainMenu;
            }
            if (playButton != null) playButton.onClick.RemoveListener(OpenLobby);
            if (deckBuilderButton != null) deckBuilderButton.onClick.RemoveListener(OpenDeckBuilder);
            if (quitButton != null) quitButton.onClick.RemoveListener(Quit);
        }

        /// <summary>Show the main menu and hide the other front-end panels. Safe to wire to buttons/events.</summary>
        public void ShowMainMenu()
        {
            SetPanels(menu: true, deck: false, lobby: false);
            RefreshSelectedDeck();
        }

        public void OpenDeckBuilder() => SetPanels(menu: false, deck: true, lobby: false);

        public void OpenLobby()
        {
            // Hand the selected deck to the net client; null = let the server pick one.
            if (netClient != null) netClient.deckCardIds = DeckStore.SelectedCardIds();
            SetPanels(menu: false, deck: false, lobby: true);
        }

        private void OnMatchStarted() => SetPanels(menu: false, deck: false, lobby: false);

        private void Quit()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        private void SetPanels(bool menu, bool deck, bool lobby)
        {
            if (mainMenuPanel != null) mainMenuPanel.SetActive(menu);
            if (deckBuilderPanel != null) deckBuilderPanel.SetActive(deck);
            if (lobbyPanel != null) lobbyPanel.SetActive(lobby);
        }

        private void RefreshSelectedDeck()
        {
            if (selectedDeckText == null) return;
            var name = DeckStore.SelectedName;
            selectedDeckText.text = string.IsNullOrEmpty(name) ? "Deck: Random" : $"Deck: {name}";
        }
    }
}
