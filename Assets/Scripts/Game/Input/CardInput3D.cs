using UnityEngine;
using UnityEngine.InputSystem;
using MetaDeck.Presentation;
using System;
using MetaDeck.Engine;
using MetaDeck.Protocol;
using MetaDeck.Unity;
using MetaDeck.Rules;
using MetaDeck.Events;

public sealed class CardInput3D : MonoBehaviour
{
    [Header("Scene Refs")]
    [SerializeField] private Camera cam;
    [SerializeField] private LayerMask cardMask;
    [SerializeField] private LayerMask zoneMask;

    [Header("Input Actions")]
    [SerializeField] private InputActionReference point; // <Pointer>/position
    [SerializeField] private InputActionReference click; // <Pointer>/press

    [Header("Drag Plane")]
    [SerializeField] private Vector3 planeNormal = default; // if zero -> Vector3.up

    [SerializeField] private GameCommandFacadeMB commandFacade;
    [SerializeField] private MetaDeckNetClientMB netClient;
    [Tooltip("Fallback local player id if no net client is present.")]
    [SerializeField] private PlayerId localPlayerId;

    private CardView3D _dragCard;
    private CardDragVisual3D _dragVisual;
    private bool _attacking; // true when the current drag is a board monster declaring an attack

    private Plane _dragPlane;
    private Vector3 _grabOffset;
    private Quaternion _dragFacingRot;

    private void Awake()
    {
        if (cam == null) cam = Camera.main;
        if (planeNormal == default) planeNormal = Vector3.up;
        if (commandFacade == null) commandFacade = FindFirstObjectByType<GameCommandFacadeMB>();
        if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
    }

    private void OnEnable()
    {
        if (point == null || point.action == null)
        {
            Debug.LogError("[CardInput3D] 'point' InputActionReference is not assigned.");
            enabled = false;
            return;
        }
        if (click == null || click.action == null)
        {
            Debug.LogError("[CardInput3D] 'click' InputActionReference is not assigned.");
            enabled = false;
            return;
        }

        point.action.Enable();
        click.action.Enable();

        click.action.performed += OnClickChanged;
        click.action.canceled += OnRelease; // safety: focus-loss / disable cancels an in-progress drag
    }

    private void OnDisable()
    {
        click.action.performed -= OnClickChanged;
        click.action.canceled -= OnRelease;
        click.action.Disable();
        point.action.Disable();
    }

    private void Update()
    {
        if (_dragCard == null) return;
        if (TryGetPointerOnPlane(out var planePoint))
            _dragVisual.SetDragTarget(planePoint + _grabOffset, _dragFacingRot);
    }

    // The 'Click' action is PassThrough: 'performed' fires on BOTH press and release.
    private void OnClickChanged(InputAction.CallbackContext ctx)
    {
        if (ctx.ReadValueAsButton()) TryPick();
        else TryDrop();
    }

    private void OnRelease(InputAction.CallbackContext _) => TryDrop();

    private PlayerId LocalPlayer => netClient != null ? netClient.LocalPlayer : localPlayerId;

    private void TryPick()
    {
        var ray = cam.ScreenPointToRay(point.action.ReadValue<Vector2>());
        if (!Physics.Raycast(ray, out var hit, 200f, cardMask)) return;

        var card = hit.collider.GetComponentInParent<CardView3D>();
        if (card == null) return;

        var visual = card.GetComponent<CardDragVisual3D>();
        if (visual == null) return;

        // A friendly board monster is dragged to declare an ATTACK; a hand card to summon/play.
        bool isFriendlyBoardMonster =
            card.Instance != null && card.Owner == LocalPlayer && card.Instance.Zone == Zone.Board;

        if (isFriendlyBoardMonster)
        {
            _attacking = true;
        }
        else
        {
            if (card.IsPlaced || !card.IsDraggable) return; // can't pick placed/undraggable hand cards
            _attacking = false;
        }

        _dragCard = card;
        _dragVisual = visual;

        _dragPlane = new Plane(planeNormal, _dragCard.transform.position);
        _grabOffset = TryGetPointerOnPlane(out var planePoint) ? _dragCard.transform.position - planePoint : Vector3.zero;
        _dragFacingRot = _dragCard.transform.rotation;

        _dragCard.IsDragging = true;
        _dragVisual.BeginDrag();
    }

    // Optimistic online: a drop only SENDS a command. The card always snaps back; the authoritative
    // snapshot from the server then re-renders it in its true position (or leaves it, if rejected).
    private void TryDrop()
    {
        if (_dragCard == null) return;

        var ray = cam.ScreenPointToRay(point.action.ReadValue<Vector2>());

        if (_attacking) HandleAttackDrop(ray);
        else HandleSummonOrPlayDrop(ray);

        _dragVisual.CancelDrag();
        _dragCard.IsDragging = false;
        _dragCard = null;
        _dragVisual = null;
        _attacking = false;
    }

    private void HandleAttackDrop(Ray ray)
    {
        var attacker = _dragCard.Instance;
        if (commandFacade == null || attacker == null) return;

        // Prefer the nearest enemy monster under the cursor. Use RaycastAll and skip the dragged
        // attacker itself (it follows the cursor and would otherwise occlude the ray).
        var hits = Physics.RaycastAll(ray, 250f, cardMask);
        CardView3D defender = null;
        float best = float.MaxValue;
        foreach (var h in hits)
        {
            var v = h.collider.GetComponentInParent<CardView3D>();
            if (v == null || v == _dragCard || v.Instance == null) continue;
            if (v.Instance.Owner == LocalPlayer) continue;
            if (h.distance < best) { best = h.distance; defender = v; }
        }

        if (defender != null)
        {
            commandFacade.TryBeginAttack(attacker, defender.Instance, out _);
            return;
        }

        // Otherwise, the enemy face.
        if (Physics.Raycast(ray, out var zoneHit, 250f, zoneMask) &&
            zoneHit.collider.GetComponentInParent<FaceDropZone3D>() != null)
        {
            commandFacade.TryBeginAttackFace(attacker, out _);
        }
    }

    private void HandleSummonOrPlayDrop(Ray ray)
    {
        var instance = _dragCard.Instance;
        if (commandFacade == null || instance == null || instance.Owner != LocalPlayer) return;

        // Monsters summon onto a friendly board slot.
        if (instance.Def.type == CardType.Monster)
        {
            if (Physics.Raycast(ray, out var zhit, 250f, zoneMask))
            {
                var slot = zhit.collider.GetComponentInParent<BoardSlotDropZone3D>();
                if (slot != null && slot.IsPlayerSide)
                    commandFacade.TrySummonMonster(instance, Zone.Hand, slot.SlotIndex, out _);
            }
            return;
        }

        // Spells/traps: target is whatever was dropped on (a monster or a face); none otherwise.
        var target = ResolveSpellTarget(ray);

        // A Quick card dropped while it's your priority in a chain window is a CHAIN RESPONSE.
        var snap = netClient != null ? netClient.LatestSnapshot : null;
        bool inResponseWindow = snap != null
                                && snap.Phase == GamePhase.ChainResponse
                                && snap.PriorityPlayer == LocalPlayer;

        if (inResponseWindow && instance.Def.speedWindow == SpeedWindow.Quick)
            commandFacade.TryRespondQuickFromHand(instance, target, out _);
        else
            commandFacade.TryPlayCard(instance, Zone.Hand, target, asChainItem: false, out _);
    }

    /// <summary>Resolve a spell's target from the drop: a monster under the cursor, a face, or none.</summary>
    private TargetSpec ResolveSpellTarget(Ray ray)
    {
        // Nearest monster under the cursor (either side), excluding the dragged card itself.
        var hits = Physics.RaycastAll(ray, 250f, cardMask);
        CardView3D best = null;
        float bestDist = float.MaxValue;
        foreach (var h in hits)
        {
            var v = h.collider.GetComponentInParent<CardView3D>();
            if (v == null || v == _dragCard || v.Instance == null) continue;
            if (h.distance < bestDist) { bestDist = h.distance; best = v; }
        }
        if (best != null) return new TargetSpec(best.Instance);

        // Otherwise a player's face, if dropped on one.
        if (Physics.Raycast(ray, out var zhit, 250f, zoneMask))
        {
            var face = zhit.collider.GetComponentInParent<FaceDropZone3D>();
            if (face != null) return new TargetSpec(face.FacePlayer);
        }

        return TargetSpec.None();
    }

    private bool TryGetPointerOnPlane(out Vector3 worldPoint)
    {
        var ray = cam.ScreenPointToRay(point.action.ReadValue<Vector2>());
        if (_dragPlane.Raycast(ray, out var enter))
        {
            worldPoint = ray.GetPoint(enter);
            return true;
        }
        worldPoint = default;
        return false;
    }
}
