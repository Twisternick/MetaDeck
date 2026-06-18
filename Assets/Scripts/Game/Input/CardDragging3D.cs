using System.Collections;
using UnityEngine;
using MetaDeck.Presentation;
using MetaDeck.Unity;

[RequireComponent(typeof(Rigidbody))]
public sealed class CardDraggable3D : MonoBehaviour, IDraggable3D
{
    [Header("Motion")]
    [SerializeField] private float followSmoothTime = 0.06f; // lower = tighter follow
    [SerializeField] private float liftWhileDragging = 0.25f;
    [SerializeField] private float snapDuration = 0.12f;

    private Rigidbody _rb;
    private Vector3 _targetWorldPos;
    private Vector3 _velocity; // used for dampening when not using MovePosition lerp
    private bool _isDragging;
    private Vector3 _pointerOffsetLocal; // offset in local space from cardroot to pointer hit
    private Transform _root; // transform to move (could be visualRoot)
    private Coroutine _snapRoutine;

    public bool IsDragging => _isDragging;

    private void Awake()
    {
        _rb = GetComponent<Rigidbody>();
        _rb.interpolation = RigidbodyInterpolation.Interpolate;
        _root = transform;
    }

    public void BeginDrag(Vector3 worldPoint, Vector3 pointerOffset)
    {
        if (_snapRoutine != null) StopCoroutine(_snapRoutine);
        _isDragging = true;

        // pointerOffset: world-space from hit point to card center; store in local for more robust movement
        _pointerOffsetLocal = _root.InverseTransformVector(pointerOffset);

        // raise the target slightly
        _targetWorldPos = worldPoint + Vector3.up * liftWhileDragging;
        // disable gravity while dragging (so physics won't pull it away)
        _rb.useGravity = false;
        _rb.linearVelocity = Vector3.zero;
        _rb.angularVelocity = Vector3.zero;
    }

    public void DragTo(Vector3 worldPoint)
    {
        // worldPoint = the point on the drag plane under the pointer. Apply the pointer offset to maintain grab spot.
        var offsetWorld = _root.TransformVector(_pointerOffsetLocal);
        _targetWorldPos = worldPoint + Vector3.up * liftWhileDragging + offsetWorld;
    }

    public void EndDrag(bool droppedOnZone, DropZone3D zone)
    {
        _isDragging = false;

        // re-enable gravity / physics if you want cards to react again.
        _rb.useGravity = false; // keep false if you want the card to stay put; true if they should fall
        _rb.linearVelocity = Vector3.zero;

        // If dropped on a zone, let the zone do final parent/snap. But do a short snap animation for feel.
        if (droppedOnZone && zone != null)
        {
            // compute anchor / desired transform: ask the zone if it wants to parent/snap.
            // We'll ask the zone to execute OnDrop which will parent and set local pos/rot.
            // But to make the animation smooth, we first perform a small interpolation to the anchor.
            _snapRoutine = StartCoroutine(SnapThenLetZone(zone));
        }
        else
        {
            // not dropped -> return to layout or hand: for now we snap to current position (no-op).
            // You probably want to tell your layout system to re-parent back to hand. Example hook:
            // LayoutManager.Instance.ReturnCardToHand(this);
        }
    }

    private IEnumerator SnapThenLetZone(DropZone3D zone)
    {
        // If the zone has a public snap anchor transform, we'd prefer to animate to that anchor position.
        Transform anchor = null;

        // try to reflectively find a snapAnchor field if present (BoardSlotDropZone3D has one).
        var boardSlot = zone as BoardSlotDropZone3D;
        if (boardSlot != null)
            anchor = boardSlot.SnapAnchor;

        // fallback: just call zone.OnDrop immediately if no anchor found (zone handles parenting).
        if (anchor == null)
        {
            zone.OnDrop(GetComponent<CardView3D>());
            yield break;
        }

        // animate position + rotation toward anchor then call zone.OnDrop to finalize parent
        var startPos = _root.position;
        var startRot = _root.rotation;
        var endPos = anchor.position;
        var endRot = anchor.rotation;

        float t = 0f;
        while (t < 1f)
        {
            t += Time.deltaTime / Mathf.Max(0.001f, snapDuration);
            var p = Mathf.SmoothStep(0f, 1f, t);
            // move rigidbody to interpolated position
            _rb.MovePosition(Vector3.Lerp(startPos, endPos, p));
            _rb.MoveRotation(Quaternion.Slerp(startRot, endRot, p));
            yield return null;
        }

        // finalize: let zone parent / set local pose (this will keep things consistent)
        zone.OnDrop(GetComponent<CardView3D>());
        _snapRoutine = null;
    }

    private void FixedUpdate()
    {
        if (_isDragging)
        {
            // smooth follow. Use MovePosition for predictable physics contact
            var newPos = Vector3.Lerp(_rb.position, _targetWorldPos, 1f - Mathf.Exp(-followSmoothTime * Time.fixedDeltaTime * 60f));
            _rb.MovePosition(newPos);
            // optionally rotate/tilt while dragging (not included)
        }
    }
}