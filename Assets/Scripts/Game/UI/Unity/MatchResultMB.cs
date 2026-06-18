using TMPro;
using UnityEngine;
using UnityEngine.UI;
using MetaDeck.Protocol;

namespace MetaDeck.Unity
{
    /// <summary>
    /// End-of-match screen. Shows the result on GameOver with Rematch / Leave buttons, reflects the
    /// "waiting for opponent to rematch" state, and handles the opponent leaving. Hides itself when a
    /// (re)match starts. Assign the UI elements in the Inspector.
    /// </summary>
    public sealed class MatchResultMB : MonoBehaviour
    {
        [Header("Refs")]
        [SerializeField] private MetaDeckNetClientMB netClient;

        [Header("UI")]
        [SerializeField] private GameObject resultPanel;
        [SerializeField] private TMP_Text resultText;
        [SerializeField] private Button rematchButton;
        [SerializeField] private Button leaveButton;
        [Tooltip("Optional: re-shown when you leave or the opponent leaves (your lobby UI).")]
        [SerializeField] private GameObject lobbyPanel;

        // True once the server has already removed us from the match (opponent left) — so Leave
        // shouldn't send another LeaveMatch (the server is back in lobby mode and would reject it).
        private bool _detached;

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
        }

        private void OnEnable()
        {
            if (netClient != null)
            {
                netClient.OnEvent += OnEvent;
                netClient.OnRematchPending += OnRematchPending;
                netClient.OnOpponentLeft += OnOpponentLeft;
                netClient.OnWelcome += OnMatchStarted;
            }
            if (rematchButton != null) rematchButton.onClick.AddListener(OnRematchClicked);
            if (leaveButton != null) leaveButton.onClick.AddListener(OnLeaveClicked);
            if (resultPanel != null) resultPanel.SetActive(false);
        }

        private void OnDisable()
        {
            if (netClient != null)
            {
                netClient.OnEvent -= OnEvent;
                netClient.OnRematchPending -= OnRematchPending;
                netClient.OnOpponentLeft -= OnOpponentLeft;
                netClient.OnWelcome -= OnMatchStarted;
            }
            if (rematchButton != null) rematchButton.onClick.RemoveListener(OnRematchClicked);
            if (leaveButton != null) leaveButton.onClick.RemoveListener(OnLeaveClicked);
        }

        private void OnEvent(EventDto e)
        {
            if (e == null || e.Kind != EventKind.GameOver) return;

            string text = e.Winner == null ? "Draw"
                        : e.Winner == netClient.LocalPlayer ? "Victory!"
                        : "Defeat";
            Show(text, allowRematch: true);
        }

        private void OnRematchPending() => SetStatus("Waiting for opponent to rematch…", allowRematch: false);

        private void OnOpponentLeft()
        {
            _detached = true; // server already removed us from the match
            Show("Opponent left.", allowRematch: false);
        }

        private void OnMatchStarted()
        {
            _detached = false;
            if (resultPanel != null) resultPanel.SetActive(false);
            if (lobbyPanel != null) lobbyPanel.SetActive(false);
        }

        private void OnRematchClicked() => netClient?.Rematch();

        private void OnLeaveClicked()
        {
            if (!_detached) netClient?.LeaveMatch(); // only tell the server if we're still in the match
            _detached = false;
            if (resultPanel != null) resultPanel.SetActive(false);
            if (lobbyPanel != null) lobbyPanel.SetActive(true); // back to matchmaking
        }

        private void Show(string text, bool allowRematch)
        {
            if (resultPanel != null) resultPanel.SetActive(true);
            SetStatus(text, allowRematch);
        }

        private void SetStatus(string text, bool allowRematch)
        {
            if (resultText != null) resultText.text = text;
            if (rematchButton != null) rematchButton.interactable = allowRematch;
        }
    }
}
