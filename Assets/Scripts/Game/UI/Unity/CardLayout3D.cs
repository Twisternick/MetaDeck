using System.Collections.Generic;
using UnityEngine;

public sealed class CardLayout3D : MonoBehaviour
{
    private readonly Dictionary<int, Transform> _targets = new(); // instanceId -> target transform

    public void SetTarget(int instanceId, Transform target) => _targets[instanceId] = target;
    public void ClearTarget(int instanceId) => _targets.Remove(instanceId);

    private void Update()
    {
        foreach (var kv in _targets)
        {
            // find actual card GO by instanceId however you store them
            // e.g. in a registry: CardViewRegistry.Get(kv.Key)
        }
    }

    public static void MoveTowards(Transform card, Transform target, float moveSpeed, float rotateSpeed)
    {
        card.position = Vector3.Lerp(card.position, target.position, Time.deltaTime * moveSpeed);
        card.rotation = Quaternion.Slerp(card.rotation, target.rotation, Time.deltaTime * rotateSpeed);
    }
}