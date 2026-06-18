using System.Collections;
using UnityEngine;

namespace MetaDeck.Presentation
{
    public sealed class CardDragVisual3D : MonoBehaviour
    {
        [Header("Drag Feel")]
        [SerializeField] private float followSharpness = 22f;   // higher = tighter follow
        [SerializeField] private float snapDuration = 0.12f;    // seconds
        [SerializeField] private float dragLift = 0.25f;        // meters
        [SerializeField] private float dragTiltDegrees = 8f;    // optional tilt while dragging

        private Transform _t;
        private Coroutine _snapRoutine;

        private Vector3 _targetPos;
        private Quaternion _targetRot;

        private Vector3 _startPos;
        private Quaternion _startRot;
        private Transform _startParent;

        public bool IsDragging { get; private set; }

        private void Awake()
        {
            _t = transform;
            _targetPos = _t.position;
            _targetRot = _t.rotation;
        }

        public void BeginDrag()
        {
            if (_snapRoutine != null) StopCoroutine(_snapRoutine);
            IsDragging = true;

            _startParent = _t.parent;
            _startPos = _t.position;
            _startRot = _t.rotation;
        }

        public void SetDragTarget(Vector3 worldPos, Quaternion desiredWorldRot)
        {
            // Add lift
            _targetPos = worldPos + Vector3.up * dragLift;

            // Optional slight tilt while dragging (multiply on top of desired)
            _targetRot = desiredWorldRot * Quaternion.Euler(dragTiltDegrees, 0f, 0f);
        }

        public void EndDragSnapTo(Transform anchor, bool reparent)
        {
            if (_snapRoutine != null) StopCoroutine(_snapRoutine);
            IsDragging = false;
            
            /* _snapRoutine = StartCoroutine(SnapRoutine(
                endPos: anchor.position,
                endRot: anchor.rotation * Quaternion.Euler(90f, 0f, 0f), // example: flip to lie flat in zone
                endParent: reparent ? anchor : _t.parent,
                endLocal: true
            )); */
        }

        public void CancelDrag()
        {
            if (_snapRoutine != null) StopCoroutine(_snapRoutine);
            IsDragging = false;

            _snapRoutine = StartCoroutine(SnapRoutine(
                endPos: _startPos,
                endRot: _startRot,
                endParent: _startParent,
                endLocal: false
            ));
        }

        private IEnumerator SnapRoutine(Vector3 endPos, Quaternion endRot, Transform endParent, bool endLocal)
        {
            var startPos = _t.position;
            var startRot = _t.rotation;

            float t = 0f;
            while (t < 1f)
            {
                t += Time.deltaTime / Mathf.Max(0.001f, snapDuration);
                var p = Mathf.SmoothStep(0f, 1f, t);

                _t.position = Vector3.Lerp(startPos, endPos, p);
                _t.rotation = Quaternion.Slerp(startRot, endRot, p);
                yield return null;
            }

            // Finalize parent + pose
            if (endParent != null)
                _t.SetParent(endParent, worldPositionStays: !endLocal);

            if (endLocal && endParent != null)
            {
                _t.localPosition = Vector3.zero;
                _t.localRotation = Quaternion.identity;
            }

            _snapRoutine = null;
        }

        private void Update()
        {
            if (!IsDragging) return;

            // Exponential smoothing (frame-rate independent)
            var k = 1f - Mathf.Exp(-followSharpness * Time.deltaTime);
            _t.position = Vector3.Lerp(_t.position, _targetPos, k);
            _t.rotation = Quaternion.Slerp(_t.rotation, _targetRot, k);
        }
    }
}