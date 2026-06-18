using TMPro;
using UnityEngine;
using UnityEngine.UI;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Heads-up display bound to the server snapshot: turn indicator, mana, and the End Turn button.
    /// Subscribes to MetaDeckNetClientMB.OnSnapshot (the single source of truth) and reads the DTO
    /// fields directly. Assign the UI elements in the Inspector.
    /// </summary>
    public sealed class MatchHudMB : MonoBehaviour
    {
        [Header("Refs")]
        [SerializeField] private MetaDeckNetClientMB netClient;
        [SerializeField] private GameCommandFacadeMB commandFacade;

        [Header("UI")]
        [SerializeField] private TMP_Text turnText;       // e.g. "Your turn (Turn 4)"
        [SerializeField] private TMP_Text manaText;       // e.g. "3 / 5"
        [SerializeField] private TMP_Text opponentManaText; // optional
        [SerializeField] private Button endTurnButton;

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
            if (commandFacade == null) commandFacade = FindFirstObjectByType<GameCommandFacadeMB>();
        }

        private void OnEnable()
        {
            if (netClient != null) netClient.OnSnapshot += Refresh;
            if (endTurnButton != null) endTurnButton.onClick.AddListener(OnEndTurnClicked);
        }

        private void OnDisable()
        {
            if (netClient != null) netClient.OnSnapshot -= Refresh;
            if (endTurnButton != null) endTurnButton.onClick.RemoveListener(OnEndTurnClicked);
        }

        private void OnEndTurnClicked()
        {
            // Optimistic: send; the server validates and the resulting snapshot updates this HUD.
            if (commandFacade != null) commandFacade.TryEndTurn(out _);
        }

        private void Refresh(SnapshotDto snap)
        {
            if (snap == null) return;

            var local = netClient.LocalPlayer;
            bool myTurn = snap.ActivePlayer == local;

            var me = FindPlayer(snap, local);
            var opp = FindPlayer(snap, Opponent(local));

            if (turnText != null)
                turnText.text = (myTurn ? "Your turn" : "Opponent's turn") + $"  (Turn {snap.TurnNumber})";

            if (manaText != null && me != null)
                manaText.text = $"{me.Bandwidth} / {me.MaxBandwidth}";

            if (opponentManaText != null && opp != null)
                opponentManaText.text = $"{opp.Bandwidth} / {opp.MaxBandwidth}";

            // Only let the player end the turn when it's actually theirs (the server also enforces this).
            if (endTurnButton != null)
                endTurnButton.interactable = myTurn && !snap.IsOver;
        }

        private static PlayerViewDto FindPlayer(SnapshotDto snap, PlayerId id)
        {
            foreach (var p in snap.Players)
                if (p.Id == id) return p;
            return null;
        }

        private static PlayerId Opponent(PlayerId id) => id == PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;
    }
}
