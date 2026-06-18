using UnityEngine;
using UnityEngine.UI;

namespace MetaDeck.Unity
{
    [RequireComponent(typeof(BoardSlot))]
    public sealed class BoardSlotViewMB : MonoBehaviour
    {
        [SerializeField] private Image highlight;

        private BoardSlot _slot;

        public int SlotIndex => _slot.SlotIndex;
        public bool IsPlayerSide => _slot.IsPlayerSide;

        private void Awake()
        {
            _slot = GetComponent<BoardSlot>();
            SetHighlight(false);
        }

        public void SetHighlight(bool on)
        {
            if (highlight != null) highlight.enabled = on;
        }
    }
}