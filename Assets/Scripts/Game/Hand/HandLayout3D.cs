using System.Collections.Generic;
using UnityEngine;
using MetaDeck.Presentation;

public sealed class HandLayout3D : MonoBehaviour
{
    [Header("Layout")]
    [SerializeField] private float spacing = 0.28f;          // distance between cards (world units)
    [SerializeField] private float maxFanAngle = 28f;        // degrees total spread (fan)
    [SerializeField] private float radius = 2.0f;            // fan radius (bigger = flatter)
    [SerializeField] private int visibleCapacity = 8;        // how many fit before scroll matters
    [SerializeField] private float arcWeight = 1f;

    [Header("Scroll")]
    [SerializeField, Range(0f, 1f)] private float scroll01;  // 0..1
    [SerializeField] private float scrollSpeed = 0.12f;
    [SerializeField] private bool snapToCards = true;
    [SerializeField] private float snapSpeed = 12f;

    [Header("Smoothing")]
    [SerializeField] private float positionLerp = 18f;
    [SerializeField] private float rotationLerp = 18f;

    private readonly List<CardView3D> cards = new();

    public void RebuildFromChildren()
    {
        cards.Clear();
        for (int i = 0; i < transform.childCount; i++)
        {
            var cv = transform.GetChild(i).GetComponent<CardView3D>();
            if (cv != null) cards.Add(cv);
        }
    }

    public void SetCards(List<CardView3D> cardViews)
    {
        cards.Clear();
        cards.AddRange(cardViews);
    }

    public void AddScrollDelta(float delta)
    {
        // delta positive should move right; invert if you prefer
        scroll01 = Mathf.Clamp01(scroll01 + delta * scrollSpeed);
    }

    private void LateUpdate()
    {
        ApplyLayout(Time.deltaTime);
    }

    private void ApplyLayout(float dt)
    {
        int count = cards.Count;
        if (count == 0) return;

        // how far we can scroll in "card units"
        float maxStart = Mathf.Max(0f, count - visibleCapacity);

        // map scroll01 -> start index float
        float startIndex = (maxStart <= 0f) ? 0f : scroll01 * maxStart;

        // optional snapping so it lands on clean positions
        if (snapToCards && maxStart > 0f)
        {
            float snapped = Mathf.Round(startIndex);
            startIndex = Mathf.Lerp(startIndex, snapped, 1f - Mathf.Exp(-snapSpeed * dt));

            // keep scroll01 consistent with snapped movement
            scroll01 = (maxStart <= 0f) ? 0f : Mathf.Clamp01(startIndex / maxStart);
        }

        // Decide which indices are "visible window"
        int first = Mathf.FloorToInt(startIndex);
        float t = startIndex - first;

        // For layout, we still place ALL cards (simpler).
        // If you want virtualization, only place a window and pool the rest.
        for (int i = 0; i < count; i++)
        {
            if (cards[i] == null) continue;                          // view destroyed (card left the hand)
            if (cards[i].IsDragging || cards[i].IsPlaced) continue;   // skip if user is dragging this card
            // position relative to startIndex (like ScrollRect content position)
            float localI = i - startIndex;

            // center visible window around 0
            float centered = localI - (Mathf.Min(visibleCapacity, count) - 1) * 0.5f;

            // 1) Base row position
            Vector3 rowPos = new Vector3(centered * spacing, 0f, 0f);

            // 2) Fan curve (optional): convert row x to angle
            float spread = Mathf.Min(maxFanAngle, (count - 1) * (maxFanAngle / Mathf.Max(1, visibleCapacity - 1)));
            float angle = (visibleCapacity <= 1) ? 0f : (centered / (visibleCapacity * 0.5f)) * (spread * 0.5f);

            // place on arc: rotate forward vector around Y by angle, then scale by radius
            Quaternion arcRot = Quaternion.Euler(0f, angle, 0f);
            Vector3 arcPos = arcRot * Vector3.forward * radius;
            arcPos = new Vector3(arcPos.x, 0f, arcPos.z); // keep flat

            // Blend row + arc (fan feel). Adjust weight if you want more/less curve.
            
            Vector3 targetLocalPos = Vector3.Lerp(rowPos, arcPos, arcWeight);

            // Card faces camera-ish: yaw opposite the arc so it fans nicely
            Quaternion targetLocalRot = Quaternion.Euler(0f, angle, 0f);

            // Smooth
            CardView3D c = cards[i];
            c.transform.localPosition = Vector3.Lerp(c.transform.localPosition, targetLocalPos, 1f - Mathf.Exp(-positionLerp * dt));
            c.transform.localRotation = Quaternion.Slerp(c.transform.localRotation, targetLocalRot, 1f - Mathf.Exp(-rotationLerp * dt));
        }
    }
}