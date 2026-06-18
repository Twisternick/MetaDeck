using UnityEngine;
using UnityEngine.InputSystem;
using MetaDeck.Presentation;
using System;
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
    [SerializeField] private PlayerId localPlayerId;

    private CardView3D _dragCard;
    private CardDragVisual3D _dragVisual;
    private bool _attacking; // true when the current drag is a board monster declaring an attack

    private Plane _dragPlane;
    private Vector3 _grabOffset; // keeps grab point stable
    private Quaternion _dragFacingRot; // rotation we want while dragging (e.g. keep current)

    private void Awake()
    {
        if (cam == null) cam = Camera.main;
        if (planeNormal == default) planeNormal = Vector3.up;
        if (commandFacade == null) commandFacade = FindFirstObjectByType<GameCommandFacadeMB>();
    }

    private void OnEnable()
    {
        Debug.Log("[CardInput3D] OnEnable");

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
        {
            // Maintain the original grab point offset
            var desiredPos = planePoint + _grabOffset;
            _dragVisual.SetDragTarget(desiredPos, _dragFacingRot);
        }
    }

    // The 'Click' action is PassThrough, so 'performed' fires on BOTH press and release
    // (and 'canceled' only fires on focus-loss/disable, not on normal mouse-up). Branch on the
    // current button value: pressed -> pick up the card, released -> attempt the drop.
    private void OnClickChanged(InputAction.CallbackContext ctx)
    {
        if (ctx.ReadValueAsButton())
            TryPick();
        else
            TryDrop();
    }

    private void OnRelease(InputAction.CallbackContext _)
    {
        TryDrop();
    }

    private void TryPick()
    {
        var ray = cam.ScreenPointToRay(point.action.ReadValue<Vector2>());
        if (!Physics.Raycast(ray, out var hit, 200f, cardMask))
            return;

        var card = hit.collider.GetComponentInParent<CardView3D>();
        if (card == null) return;

        var visual = card.GetComponent<CardDragVisual3D>();
        if (visual == null) return;

        // A friendly monster on the board is dragged to declare an ATTACK (drop on enemy monster/face).
        // A hand card is dragged to summon/play (existing path).
        bool isFriendlyBoardMonster =
            card.Instance != null && card.Owner == localPlayerId && card.Instance.Zone == Zone.Board;

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

        // Plane through the card position
        _dragPlane = new Plane(planeNormal, _dragCard.transform.position);

        // compute offset so we don't snap card center to pointer
        if (TryGetPointerOnPlane(out var planePoint))
            _grabOffset = _dragCard.transform.position - planePoint;
        else
            _grabOffset = Vector3.zero;

        _dragFacingRot = _dragCard.transform.rotation;

        _dragCard.IsDragging = true;
        _dragVisual.BeginDrag();

        // optional: bring to front so it draws above others
        //_dragCard.transform.SetParent(null, true);
    }

    private void TryDrop()
    {
        if (_dragCard == null) return;
        print("Trying to drop card...");

        var ray = cam.ScreenPointToRay(point.action.ReadValue<Vector2>());

        DropZone3D zone = null;
        if (Physics.Raycast(ray, out var hit, 250f, zoneMask))
            zone = hit.collider.GetComponentInParent<DropZone3D>();

        // ATTACK drag: a board monster dropped onto an enemy monster slot or the enemy face.
        if (_attacking)
        {
            string aReason = "Not a valid attack target.";
            bool ok = false;
            if (commandFacade != null && _dragCard.Instance != null)
            {
                if (zone is BoardSlotDropZone3D bs && !bs.IsPlayerSide)
                    ok = commandFacade.TryAttackEnemySlot(_dragCard.Instance, bs.SlotIndex, out aReason);
                else if (zone is FaceDropZone3D)
                    ok = commandFacade.TryBeginAttackFace(_dragCard.Instance, out aReason);
            }

            if (!ok) Debug.LogWarning("Attack rejected: " + aReason);

            // The attacker never leaves its slot; snap the visual back. Board re-renders from events.
            _dragVisual.CancelDrag();
            _dragCard.IsDragging = false;
            _dragCard = null;
            _dragVisual = null;
            _attacking = false;
            return;
        }

        // Default: reject
        bool accepted = false;

        if (zone != null && zone.CanDrop(_dragCard))
        {
            // 1) Build & submit an engine command FIRST
            //    (Only if it succeeds do we finalize the visual placement)
            if (commandFacade == null)
            {
                Debug.LogWarning("CardInput3D: No GameCommandFacadeMB assigned.");
                accepted = false;
            }
            else if (_dragCard.Instance == null)
            {
                Debug.LogWarning("CardInput3D: Dragged card has no bound CardInstance.");
                accepted = false;
            }
            else
            {
                var instance = _dragCard.Instance;

                // Example: only allow local player to play their own cards
                // (Optional, but recommended UX gate)
                if (instance.Owner != localPlayerId)
                {
                    accepted = false;
                }
                else
                {
                    // If dropped onto a board slot, attempt summon/play based on type
                    if (zone is BoardSlotDropZone3D boardSlot)
                    {
                        // You need a slot index. Best is to store it on the zone.
                        // Add: [SerializeField] private int slotIndex; public int SlotIndex => slotIndex;
                        int slotIndex = boardSlot.SlotIndex;
                        bool playerSide = boardSlot.IsPlayerSide;

                        string reason;
                        if (instance.Def.type == CardType.Monster)
                        {
                            accepted = commandFacade.TrySummonMonster(instance, Zone.Hand, slotIndex, out reason);
                        }
                        else
                        {
                            // For now target = None (or make a target from zone/slot)
                            var target = TargetSpec.None();
                            accepted = commandFacade.TryPlayCard(instance, Zone.Hand, target, asChainItem: false, out reason);
                        }

                        if (!accepted)
                            Debug.LogWarning("Play rejected: " + reason);
                    }
                    else
                    {
                        // Dropped onto some other zone: by default reject (or support later)
                        accepted = false;
                    }
                }
            }

            // 2) If engine accepted, finalize placement visually
            if (accepted)
            {
                // zone sets parent/local pose + occupancy
                zone.OnDrop(_dragCard);

                _dragCard.IsPlaced = true;

                // Snap animation to slot anchor if available
                if (zone is BoardSlotDropZone3D bs && bs.SnapAnchor != null)
                    _dragVisual.EndDragSnapTo(bs.SnapAnchor, reparent: false);
                else
                    _dragVisual.EndDragSnapTo(_dragCard.transform, reparent: false);
            }
        }

        // 3) If not accepted, rollback
        if (!accepted)
        {
            _dragCard.IsPlaced = false;
            _dragVisual.CancelDrag();
        }

        _dragCard.IsDragging = false;
        _dragCard = null;
        _dragVisual = null;
        _attacking = false;
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