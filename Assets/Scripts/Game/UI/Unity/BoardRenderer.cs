using System.Collections;
using System.Collections.Generic;
using System.Linq;
using MetaDeck.Core;
using MetaDeck.Rules;
using MetaDeck.Unity;
using UnityEngine;

/// <summary>
/// Renders monsters on the board: places each occupied slot's card at its slot anchor
/// (tweened) and prunes views for cards that have left play. Visual-only.
/// Runs its placement tween through a supplied MonoBehaviour coroutine host.
/// </summary>
public sealed class BoardRenderer
{
    private readonly ViewRegistry _registry;
    private readonly BoardSlotViewMB[] _playerSlots;
    private readonly BoardSlotViewMB[] _enemySlots;
    private readonly Transform _boardRoot;
    private readonly MonoBehaviour _coroutineHost;

    public BoardRenderer(
        ViewRegistry registry,
        BoardSlotViewMB[] playerSlots,
        BoardSlotViewMB[] enemySlots,
        Transform boardRoot,
        MonoBehaviour coroutineHost)
    {
        _registry = registry;
        _playerSlots = playerSlots;
        _enemySlots = enemySlots;
        _boardRoot = boardRoot;
        _coroutineHost = coroutineHost;
    }

    public void Render(GameState state, PlayerId viewer)
    {
        for (int i = 0; i < _playerSlots.Length; i++)
        {
            var card = state.Board.GetAt(viewer, i);
            if (card != null)
                PlaceOnBoard(card, i, ownerIsPlayer: true);
        }

        var opponent = state.OpponentOf(viewer);
        for (int i = 0; i < _enemySlots.Length; i++)
        {
            var card = state.Board.GetAt(opponent, i);
            if (card != null)
                PlaceOnBoard(card, i, ownerIsPlayer: false);
        }

        // Remove views for cards in zones the board doesn't display.
        // Graveyard is shown via GraveyardPanelMB, so a resolved spell's in-play view is destroyed here.
        var toRemove = _registry.Views.Keys
            .Where(c => c.Zone == Zone.Void || c.Zone == Zone.Deck || c.Zone == Zone.Graveyard)
            .ToList();
        foreach (var c in toRemove)
            _registry.Remove(c);
    }

    private void PlaceOnBoard(CardInstance card, int slotIndex, bool ownerIsPlayer)
    {
        var view = _registry.GetOrCreate(card);

        BoardSlotViewMB targetSlot = ownerIsPlayer ? _playerSlots[slotIndex] : _enemySlots[slotIndex];

        // Prefer a dedicated "SnapAnchor" child if present, else the slot transform.
        var anchorChild = targetSlot.transform.Find("SnapAnchor");
        Transform anchor = anchorChild != null ? anchorChild : targetSlot.transform;

        // Reparent to boardRoot (or scene root) so the card doesn't inherit slot scale/rotation.
        Transform parent = _boardRoot != null ? _boardRoot : null;
        view.transform.SetParent(parent, worldPositionStays: true);

        _coroutineHost.StartCoroutine(
            MoveToTransform(view.transform, anchor.position, anchor.rotation * Quaternion.Euler(90f, 0f, 0f)));

        view.Bind(card);
    }

    private static IEnumerator MoveToTransform(Transform t, Vector3 targetPos, Quaternion targetRot, float duration = 0.2f)
    {
        var startPos = t.position;
        var startRot = t.rotation;
        float elapsed = 0f;
        while (elapsed < duration)
        {
            elapsed += Time.deltaTime;
            float k = Mathf.SmoothStep(0f, 1f, elapsed / duration);
            t.position = Vector3.Lerp(startPos, targetPos, k);
            t.rotation = Quaternion.Slerp(startRot, targetRot, k);
            yield return null;
        }
        t.position = targetPos;
        t.rotation = targetRot;
    }
}
