using MetaDeck.Core;
using MetaDeck.Presentation;
using MetaDeck.Protocol;
using MetaDeck.Rules;
using MetaDeck.UI;
using MetaDeck.Unity;
using UnityEngine;

/// <summary>
/// UI composition coordinator (NO INPUT). Driven by the authoritative server: each SnapshotDto is
/// rebuilt into a GameState (ClientStateBuilder) and rendered from the LOCAL player's perspective via
/// the focused helpers (ViewRegistry / HandRenderer / BoardRenderer / HighlightController).
/// </summary>
public sealed class GameUIBinderMB : MonoBehaviour
{
    [Header("Refs")]
    [SerializeField] private MetaDeckNetClientMB netClient;
    [SerializeField] private GameCommandFacadeMB commandFacade;
    [SerializeField] private UISelectionController selection;

    [Header("Services")]
    [SerializeField] private RulesQueryService rules = new RulesQueryService();

    [Header("Prefabs/Parents")]
    [SerializeField] private CardView3D cardPrefab;
    [SerializeField] private Transform handParent;
    [SerializeField] private HandLayout3D handLayout; // optional (can be on handParent)

    [SerializeField] private Transform boardRoot;

    [Header("Board Slots (visual/highlight)")]
    [SerializeField] private BoardSlotViewMB[] playerSlots; // size 5
    [SerializeField] private BoardSlotViewMB[] enemySlots;  // size 5

    [Header("Panels")]
    [SerializeField] private GraveyardPanelMB graveyardPanel;
    [SerializeField] private CardTooltipPanelMB tooltipPanel;

    [Tooltip("Optional: enabled when the match ends (assign a 'Game Over' UI object).")]
    [SerializeField] private GameObject gameOverBanner;

    // Rendering helpers (constructed in Start once refs are resolved).
    private ViewRegistry _registry;
    private HandRenderer _handRenderer;
    private BoardRenderer _boardRenderer;
    private HighlightController _highlights;

    // Client-side view rebuilt from the latest server snapshot.
    private readonly ClientStateBuilder _builder = new ClientStateBuilder();
    private GameState _state;
    private PlayerId _viewer;

    private void Awake()
    {
        if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
        if (selection == null) selection = FindFirstObjectByType<UISelectionController>();
        if (handLayout == null && handParent != null) handLayout = handParent.GetComponent<HandLayout3D>();
    }

    private void OnEnable()
    {
        if (netClient == null) return;
        netClient.OnSnapshot += HandleSnapshot;
        netClient.OnEvent += HandleEvent;
    }

    private void OnDisable()
    {
        if (netClient == null) return;
        netClient.OnSnapshot -= HandleSnapshot;
        netClient.OnEvent -= HandleEvent;
    }

    private void Start()
    {
        WireBoardSlots();
        BuildRenderers();
        FullRefresh();
    }

    private void BuildRenderers()
    {
        _registry = new ViewRegistry(cardPrefab, handParent);
        _handRenderer = new HandRenderer(_registry, handParent, handLayout);
        _boardRenderer = new BoardRenderer(_registry, playerSlots, enemySlots, boardRoot, this);
        _highlights = new HighlightController(playerSlots, enemySlots, rules, selection);
    }

    // --------------------------
    // Server-driven updates
    // --------------------------

    private void HandleSnapshot(SnapshotDto snap)
    {
        if (snap == null) return;
        _viewer = netClient.LocalPlayer;
        _state = _builder.Build(snap);
        FullRefresh();
    }

    private void HandleEvent(EventDto e)
    {
        if (e != null && e.Kind == EventKind.GameOver)
            Debug.Log($"[GameUIBinder] Game over — {e.Reason}");
        // Visual updates are driven by the snapshot that accompanies each event burst.
    }

    private void FullRefresh()
    {
        if (_state == null || _handRenderer == null) return;

        _handRenderer.Render(_state, _viewer);
        _boardRenderer.Render(_state, _viewer);
        _highlights.UpdateHighlights(_state, _viewer);

        if (gameOverBanner != null) gameOverBanner.SetActive(_state.IsOver);
    }

    private void WireBoardSlots()
    {
        if (playerSlots == null || enemySlots == null)
        {
            Debug.LogWarning("Board slots not assigned in GameUIBinderMB.");
            return;
        }
        WireSlotSide(playerSlots, isPlayerSide: true);
        WireSlotSide(enemySlots, isPlayerSide: false);
    }

    private static void WireSlotSide(BoardSlotViewMB[] slots, bool isPlayerSide)
    {
        for (int i = 0; i < slots.Length; i++)
        {
            if (slots[i] == null) continue;
            var slot = slots[i].GetComponent<BoardSlot>();
            if (slot == null)
            {
                Debug.LogError($"BoardSlot component missing on {(isPlayerSide ? "player" : "enemy")} slot index {i}");
                continue;
            }
            slot.Init(i, isPlayerSide);
        }
    }

    // --------------------------
    // UI Buttons (route to the server via the command facade)
    // --------------------------

    public void OnClickAttackButton()
    {
        selection.StartAttackPickAttacker();
        FullRefresh();
    }

    public void OnClickPassPriority()
    {
        commandFacade.TryPassPriority(out _);
        selection.Clear();
    }

    public void OnClickOpenGraveyardActive()
    {
        if (graveyardPanel == null || _state == null) return;
        graveyardPanel.Show(_state, _viewer);
    }

    public void OnClickOpenGraveyardOpponent()
    {
        if (graveyardPanel == null || _state == null) return;
        graveyardPanel.Show(_state, _state.OpponentOf(_viewer));
    }

    public void OnClickCloseGraveyard()
    {
        if (graveyardPanel != null) graveyardPanel.Hide();
    }
}
