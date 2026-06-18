using UnityEngine;
using MetaDeck.Presentation;

namespace MetaDeck.Unity
{
    [RequireComponent(typeof(BoardSlot))]
    public sealed class BoardSlotDropZone3D : DropZone3D
    {
        [Header("Slot")]
        [SerializeField] private Transform snapAnchor;
        public Transform SnapAnchor => snapAnchor;

        [SerializeField] private bool allowReplace = false;
        [SerializeField] private bool reparentOnDrop = true;
        [SerializeField] private bool snapLocalPose = true;

        [Header("Optional Restrictions")]
        [SerializeField] private int onlyAllowOwnerPlayerId = -1;
        [SerializeField] private bool slotEnabled = true;

        [SerializeField] private CardView3D occupyingCardInstance;

        private BoardSlot _slot;
        public int SlotIndex => _slot != null ? _slot.SlotIndex : 0;
        public bool IsPlayerSide => _slot != null && _slot.IsPlayerSide;

        public bool IsOccupied => occupyingCardInstance != null;
        public CardView3D OccupyingCardInstance => occupyingCardInstance;

        private void Awake()
        {
            _slot = GetComponent<BoardSlot>();
            if (snapAnchor == null) snapAnchor = transform;
        }

        public override bool CanDrop(CardView3D cardInstance)
        {
            if (!slotEnabled) return false;
            if (cardInstance == null) return false;

            if (IsOccupied && !allowReplace) return false;
            if (occupyingCardInstance == cardInstance) return false;

            // Owner restriction hook (optional)
            if (onlyAllowOwnerPlayerId >= 0 && (int)cardInstance.Owner != onlyAllowOwnerPlayerId) return false;

            return true;
        }

        // IMPORTANT: This should only be called AFTER the engine accepts the play/summon.
        public override void OnDrop(CardView3D cardInstance)
        {
            if (!CanDrop(cardInstance)) return;

            if (IsOccupied && allowReplace)
                occupyingCardInstance = null;

            var anchor = snapAnchor != null ? snapAnchor : transform;

            if (reparentOnDrop)
                cardInstance.transform.SetParent(anchor, worldPositionStays: false);

            if (snapLocalPose)
            {
                cardInstance.transform.localPosition = Vector3.zero;
                cardInstance.transform.localRotation = Quaternion.identity;
            }
            else
            {
                cardInstance.transform.position = anchor.position;
                cardInstance.transform.rotation = anchor.rotation;
            }

            occupyingCardInstance = cardInstance;
        }

        public void ClearIfOccupant(CardView3D cardInstance)
        {
            if (occupyingCardInstance == cardInstance)
                occupyingCardInstance = null;
        }

        [ContextMenu("Clear Slot")]
        private void ClearSlot() => occupyingCardInstance = null;
    }
}