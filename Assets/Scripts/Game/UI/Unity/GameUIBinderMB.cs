using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Presentation;
using MetaDeck.Rules;
using MetaDeck.UI;
using MetaDeck.Unity;
using UnityEngine;

/// <summary>
/// UI composition coordinator (NO INPUT).
/// Subscribes to engine events and delegates rendering to focused helpers
/// (ViewRegistry / HandRenderer / BoardRenderer / HighlightController).
/// Holds all scene-wired references; the helpers are plain objects it constructs.
/// </summary>
public sealed class GameUIBinderMB : MonoBehaviour
{
    [Header("Refs")]
    [SerializeField] private GameHostMB controller;
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

    private void Awake()
    {
        if (controller == null) controller = FindFirstObjectByType<GameHostMB>();
        if (selection == null) selection = FindFirstObjectByType<UISelectionController>();

        if (handLayout == null && handParent != null)
            handLayout = handParent.GetComponent<HandLayout3D>();
    }

    private void OnEnable()
    {
        SubscribeToEvents();
    }

    private void Start()
    {
        WireBoardSlots();
        BuildRenderers();
        FullRefresh();
    }

    private void OnDisable()
    {
        UnsubscribeFromEvents();
    }

    private void BuildRenderers()
    {
        _registry = new ViewRegistry(cardPrefab, handParent);
        _handRenderer = new HandRenderer(_registry, handParent, handLayout);
        _boardRenderer = new BoardRenderer(_registry, playerSlots, enemySlots, boardRoot, this);
        _highlights = new HighlightController(playerSlots, enemySlots, rules, selection);
    }

    // --------------------------
    // Event wiring
    // --------------------------

    private void SubscribeToEvents()
    {
        if (controller == null || controller.Bus == null) return;

        controller.Bus.Subscribe<CardMoved>(OnAnyStateChange);
        controller.Bus.Subscribe<CardPlayed>(OnAnyStateChange);
        controller.Bus.Subscribe<MonsterSummoned>(OnAnyStateChange);
        controller.Bus.Subscribe<DamageDealt>(OnAnyStateChange);
        controller.Bus.Subscribe<MonsterDestroyed>(OnAnyStateChange);
        controller.Bus.Subscribe<TurnStarted>(OnAnyStateChange);
        controller.Bus.Subscribe<TurnEnded>(OnAnyStateChange);
        controller.Bus.Subscribe<ChainOpened>(OnAnyStateChange);
        controller.Bus.Subscribe<ChainResolved>(OnAnyStateChange);
        controller.Bus.Subscribe<CardModifiersChanged>(OnAnyStateChange);
        controller.Bus.Subscribe<PlayerDamaged>(OnAnyStateChange);
        controller.Bus.Subscribe<GameOver>(OnGameOver);
    }

    private void UnsubscribeFromEvents()
    {
        if (controller == null || controller.Bus == null) return;

        controller.Bus.Unsubscribe<CardMoved>(OnAnyStateChange);
        controller.Bus.Unsubscribe<CardPlayed>(OnAnyStateChange);
        controller.Bus.Unsubscribe<MonsterSummoned>(OnAnyStateChange);
        controller.Bus.Unsubscribe<DamageDealt>(OnAnyStateChange);
        controller.Bus.Unsubscribe<MonsterDestroyed>(OnAnyStateChange);
        controller.Bus.Unsubscribe<TurnStarted>(OnAnyStateChange);
        controller.Bus.Unsubscribe<TurnEnded>(OnAnyStateChange);
        controller.Bus.Unsubscribe<ChainOpened>(OnAnyStateChange);
        controller.Bus.Unsubscribe<ChainResolved>(OnAnyStateChange);
        controller.Bus.Unsubscribe<CardModifiersChanged>(OnAnyStateChange);
        controller.Bus.Unsubscribe<PlayerDamaged>(OnAnyStateChange);
        controller.Bus.Unsubscribe<GameOver>(OnGameOver);
    }

    // All relevant events trigger the same full refresh (behavior preserved).
    private void OnAnyStateChange(CardMoved e) => FullRefresh();
    private void OnAnyStateChange(CardPlayed e) => FullRefresh();
    private void OnAnyStateChange(MonsterSummoned e) => FullRefresh();
    private void OnAnyStateChange(DamageDealt e) => FullRefresh();
    private void OnAnyStateChange(MonsterDestroyed e) => FullRefresh();
    private void OnAnyStateChange(TurnStarted e) => FullRefresh();
    private void OnAnyStateChange(TurnEnded e) => FullRefresh();
    private void OnAnyStateChange(ChainOpened e) => FullRefresh();
    private void OnAnyStateChange(ChainResolved e) => FullRefresh();
    private void OnAnyStateChange(CardModifiersChanged e) => FullRefresh();
    private void OnAnyStateChange(PlayerDamaged e) => FullRefresh();

    private void OnGameOver(GameOver e)
    {
        Debug.Log($"[GameUIBinder] Game over — {e.Reason}");
        if (gameOverBanner != null) gameOverBanner.SetActive(true);
        FullRefresh();
    }

    private void FullRefresh()
    {
        if (controller == null || controller.Engine == null) return;
        if (_handRenderer == null) return; // before Start/BuildRenderers

        var state = controller.State;
        _handRenderer.Render(state);
        _boardRenderer.Render(state);
        _highlights.UpdateHighlights(state);
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
    // UI Buttons (UI -> controller, not pointer input)
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
        FullRefresh();
    }

    public void OnClickOpenGraveyardActive()
    {
        if (graveyardPanel == null) return;
        graveyardPanel.Show(controller.State, controller.State.ActivePlayer);
    }

    public void OnClickOpenGraveyardOpponent()
    {
        if (graveyardPanel == null) return;
        graveyardPanel.Show(controller.State, controller.State.OpponentOf(controller.State.ActivePlayer));
    }

    public void OnClickCloseGraveyard()
    {
        if (graveyardPanel != null) graveyardPanel.Hide();
    }
}
