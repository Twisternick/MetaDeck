using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

public sealed class BoardSlotMB : MonoBehaviour, IPointerClickHandler
{
    public int slotIndex;
    public bool isPlayerSide; // true = active player's row, false = opponent row
    public Image highlight;

    public System.Action<BoardSlotMB> OnClicked;

    private void Awake()
    {
        SetHighlight(false);
    }

    public void SetHighlight(bool on)
    {
        if (highlight != null) highlight.enabled = on;
    }

    public void OnPointerClick(PointerEventData eventData)
    {
        if (OnClicked != null) OnClicked(this);
    }
}