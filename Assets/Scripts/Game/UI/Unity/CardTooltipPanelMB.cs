using UnityEngine;
using TMPro;

public sealed class CardTooltipPanelMB : MonoBehaviour
{
    public TMP_Text titleText;
    public TMP_Text bodyText;

    public void Show(string title, string body, Vector2 screenPos)
    {
        gameObject.SetActive(true);
        if (titleText != null) titleText.text = title;
        if (bodyText != null) bodyText.text = body;

        var rt = (RectTransform)transform;
        rt.position = screenPos;
    }

    public void Hide()
    {
        gameObject.SetActive(false);
    }
}