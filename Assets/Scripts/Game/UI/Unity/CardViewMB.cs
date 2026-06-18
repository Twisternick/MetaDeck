using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;
using TMPro;
using System.Collections.Generic;
using Unity.VisualScripting;
using MetaDeck.UI;
using MetaDeck.Data;
using MetaDeck.Core;

public sealed class CardViewMB : MonoBehaviour, IPointerClickHandler, IBeginDragHandler, IDragHandler, IEndDragHandler
{
    [Header("UI")]
    public TMP_Text nameText;
    public TMP_Text costText;
    public TMP_Text attackText;
    public TMP_Text healthText;
    public TMP_Text descriptionText;
    public Image highlight;

    [HideInInspector] public CardInstance InstanceId { get; private set;}
    [HideInInspector] public int handIndex = -1;

    private Canvas _rootCanvas;
    private RectTransform _rt;
    private Vector2 _startPos;

    public System.Action<CardViewMB> OnClicked;
    public System.Action<CardViewMB> OnBeginDragCard;
    public System.Action<CardViewMB, PointerEventData> OnDragCard;
    public System.Action<CardViewMB, PointerEventData> OnEndDragCard;

    private void Awake()
    {
        if (transform is RectTransform rt)
            _rt = rt;
        _rootCanvas = GetComponentInParent<Canvas>();
        SetHighlight(false);
    }

    public void Bind(CardInstance id, string cardName, int cost, int atk, int hp, int baseHp, HashSet<MetaDeck.Rules.Keyword> description, CardDefinition def)
    {
        InstanceId = id;
        nameText.text = cardName;
        costText.text = cost.ToString();
        attackText.text = atk.ToString();
        healthText.text = hp.ToString() + " / " + baseHp.ToString();
        descriptionText.text = (description.Count == 1 && description.Contains(MetaDeck.Rules.Keyword.None)) ? "" : "<b>" + string.Join(", ", description) + "</b>" + "\n" + MetaDeck.UI.EffectText.BuildCardText(def);

    }

    public void SetHighlight(bool on)
    {
        if (highlight != null) highlight.enabled = on;
    }

    public void OnPointerClick(PointerEventData eventData)
    {
        if (OnClicked != null) OnClicked(this);
    }

    public void OnBeginDrag(PointerEventData eventData)
    {
        _startPos = _rt.anchoredPosition;
        if (OnBeginDragCard != null) OnBeginDragCard(this);
    }

    public void OnDrag(PointerEventData eventData)
    {
        if (_rootCanvas == null) return;

        Vector2 delta = eventData.delta / _rootCanvas.scaleFactor;
        _rt.anchoredPosition += delta;

        if (OnDragCard != null) OnDragCard(this, eventData);
    }

    public void OnEndDrag(PointerEventData eventData)
    {
        if (OnEndDragCard != null) OnEndDragCard(this, eventData);
        _rt.anchoredPosition = _startPos;
    }
}