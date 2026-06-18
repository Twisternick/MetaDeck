using TMPro;
using UnityEngine;
using UnityEngine.UI;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Lobby UI: Quick Match, Create Room (shows a join code), Join Room (by code). Drives
    /// MetaDeckNetClientMB's lobby methods and hides itself when the match starts (Welcome).
    /// Set MetaDeckNetClientMB.autoQuickMatch = false when using this.
    /// </summary>
    public sealed class LobbyMB : MonoBehaviour
    {
        [Header("Refs")]
        [SerializeField] private MetaDeckNetClientMB netClient;

        [Header("UI")]
        [SerializeField] private GameObject lobbyPanel;       // shown until matched
        [SerializeField] private Button quickMatchButton;
        [SerializeField] private Button createRoomButton;
        [SerializeField] private Button joinRoomButton;
        [SerializeField] private TMP_InputField joinCodeInput;
        [SerializeField] private TMP_Text statusText;

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
        }

        private void OnEnable()
        {
            if (netClient != null)
            {
                netClient.OnRoomCreated += OnRoomCreated;
                netClient.OnWaiting += OnWaiting;
                netClient.OnWelcome += OnMatchStarted;
                netClient.OnError += OnError;
            }
            if (quickMatchButton != null) quickMatchButton.onClick.AddListener(QuickMatch);
            if (createRoomButton != null) createRoomButton.onClick.AddListener(CreateRoom);
            if (joinRoomButton != null) joinRoomButton.onClick.AddListener(JoinRoom);

            if (lobbyPanel != null) lobbyPanel.SetActive(true);
            SetStatus("Choose a match type.");
        }

        private void OnDisable()
        {
            if (netClient != null)
            {
                netClient.OnRoomCreated -= OnRoomCreated;
                netClient.OnWaiting -= OnWaiting;
                netClient.OnWelcome -= OnMatchStarted;
                netClient.OnError -= OnError;
            }
            if (quickMatchButton != null) quickMatchButton.onClick.RemoveListener(QuickMatch);
            if (createRoomButton != null) createRoomButton.onClick.RemoveListener(CreateRoom);
            if (joinRoomButton != null) joinRoomButton.onClick.RemoveListener(JoinRoom);
        }

        private void QuickMatch() { netClient?.QuickMatch(); SetStatus("Searching for an opponent…"); }
        private void CreateRoom() { netClient?.CreateRoom(); SetStatus("Creating room…"); }

        private void JoinRoom()
        {
            var code = joinCodeInput != null ? joinCodeInput.text?.Trim() : null;
            if (string.IsNullOrEmpty(code)) { SetStatus("Enter a room code first."); return; }
            netClient?.JoinRoom(code);
            SetStatus($"Joining {code}…");
        }

        private void OnRoomCreated(string code) => SetStatus($"Room code: {code}\nShare it with your opponent.");
        private void OnWaiting() => SetStatus("Waiting for an opponent…");
        private void OnError(string msg) => SetStatus($"Error: {msg}");

        private void OnMatchStarted()
        {
            if (lobbyPanel != null) lobbyPanel.SetActive(false);
        }

        private void SetStatus(string s) { if (statusText != null) statusText.text = s; }
    }
}
