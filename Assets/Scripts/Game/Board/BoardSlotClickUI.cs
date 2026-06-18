using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

namespace MetaDeck.Unity
{
    [RequireComponent(typeof(BoardSlot))]
    public sealed class BoardSlotClickUI : MonoBehaviour, IPointerClickHandler
    {
        [SerializeField] private Image highlight;

        private BoardSlot _slot;

        private void Awake()
        {
            _slot = GetComponent<BoardSlot>();
            SetHighlight(false);
        }

        public void SetHighlight(bool on)
        {
            if (highlight != null) highlight.enabled = on;
        }

        public void OnPointerClick(PointerEventData eventData)
        {
            _slot.RaiseClicked();
        }
    }
}