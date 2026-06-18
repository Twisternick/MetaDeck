using UnityEngine;
using UnityEngine.UI;
using MetaDeck.Engine;
using MetaDeck.Presentation;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Surfaces the chain-response phase. Whenever the server says it's a ChainResponse window and YOU
    /// hold priority, this prompts you to respond (play a Quick card) or pass. If you have no possible
    /// Quick response it auto-passes, so ordinary attacks resolve without extra clicks.
    /// </summary>
    public sealed class ChainPromptMB : MonoBehaviour
    {
        [SerializeField] private MetaDeckNetClientMB netClient;
        [SerializeField] private GameCommandFacadeMB commandFacade;

        [Tooltip("Shown only while YOU have priority in a chain window and could respond.")]
        [SerializeField] private GameObject promptRoot;
        [SerializeField] private Button passButton;

        [Tooltip("Auto-pass when you hold priority but have no Quick card to respond with.")]
        [SerializeField] private bool autoPassWhenNoResponse = true;

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
            if (commandFacade == null) commandFacade = FindFirstObjectByType<GameCommandFacadeMB>();

            // Without these, this client can never pass priority — any chain window it owns will hang,
            // blocking the opponent from attacking again ("Cannot start an attack outside Main phase").
            if (netClient == null || commandFacade == null)
                Debug.LogWarning("[ChainPromptMB] Not fully wired (netClient/commandFacade missing). " +
                    "Chain-response windows can't auto-pass on this client and will stall combat. " +
                    "Add this component to the scene and assign its references.");
        }

        private void OnEnable()
        {
            if (netClient != null) netClient.OnSnapshot += OnSnapshot;
            if (passButton != null) passButton.onClick.AddListener(Pass);
            if (promptRoot != null) promptRoot.SetActive(false);
        }

        private void OnDisable()
        {
            if (netClient != null) netClient.OnSnapshot -= OnSnapshot;
            if (passButton != null) passButton.onClick.RemoveListener(Pass);
        }

        private void Pass() => commandFacade?.TryPassPriority(out _);

        private void OnSnapshot(SnapshotDto snap)
        {
            bool myWindow = snap != null
                            && !snap.IsOver
                            && snap.Phase == GamePhase.ChainResponse
                            && snap.PriorityPlayer == netClient.LocalPlayer;

            if (!myWindow)
            {
                if (promptRoot != null) promptRoot.SetActive(false);
                return;
            }

            if (!HasQuickResponse(snap) && autoPassWhenNoResponse)
            {
                if (promptRoot != null) promptRoot.SetActive(false);
                commandFacade?.TryPassPriority(out _);
                return;
            }

            // You could respond: show the prompt. Playing a Quick card from hand should call
            // commandFacade.TryRespondQuickFromHand(card, target, out _).
            if (promptRoot != null) promptRoot.SetActive(true);
        }

        private bool HasQuickResponse(SnapshotDto snap)
        {
            PlayerViewDto me = null;
            foreach (var p in snap.Players)
                if (p.Id == netClient.LocalPlayer) { me = p; break; }

            if (me?.Hand == null) return false;
            foreach (var c in me.Hand)
            {
                // Mirror the server's affordability gate (GameFlowStateMachine.HasPlayableQuickResponse /
                // RespondQuickFromHandCommand): Quick-speed, CurrentCost <= 1, and enough Bandwidth.
                var def = CardLibrary.Get(c.CardId);
                if (def != null && def.speedWindow == SpeedWindow.Quick
                    && c.CurrentCost <= 1 && me.Bandwidth >= c.CurrentCost)
                    return true;
            }
            return false;
        }
    }
}
