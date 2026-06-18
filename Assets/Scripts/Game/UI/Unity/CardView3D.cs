using UnityEngine;
using MetaDeck.Presentation;
using MetaDeck.Core;
using MetaDeck.Rules;

public sealed class CardView3D : MonoBehaviour
{
    [SerializeField] private CardUI ui;
    [SerializeField] private Transform visualRoot;
    [SerializeField] private float hoverLift = 0.1f;

    public CardInstance Instance { get; private set; }
    public PlayerId Owner { get; private set; }

    public bool IsDraggable { get; private set; } // could add rules-based logic here if desired

    public bool IsDragging { get; set; }
    public bool IsPlaced { get; set; }

    private Vector3 _baseLocalPos;

    private void Awake()
    {
        if (visualRoot == null) visualRoot = transform;
        _baseLocalPos = visualRoot.localPosition;
    }

    /* private void Update()
    {
        if (!IsDragging && !IsPlaced) return;
        Debug.Log(visualRoot.position);
    } */

    public void Bind(CardInstance instance)
    {
        Instance = instance;
        Owner = instance.Owner;
        ui.Render(instance);
    }

    public void SetHover(bool on)
    {
        if (visualRoot == null) return;
        visualRoot.localPosition = on ? _baseLocalPos + Vector3.up * hoverLift : _baseLocalPos;
    }

    public void SetAffordable(bool affordable)
    {
        IsDraggable = affordable;
    }
}