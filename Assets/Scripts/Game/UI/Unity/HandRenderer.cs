using System.Collections.Generic;
using System.Linq;
using MetaDeck.Core;
using MetaDeck.Rules;
using UnityEngine;

/// <summary>
/// Renders the active player's hand: ensures a view exists per hand card, parents it
/// under the hand, orders siblings to match engine order, and prunes views for cards
/// that have left the hand zone. Visual-only; reads engine state, never mutates it.
/// </summary>
public sealed class HandRenderer
{
    private readonly ViewRegistry _registry;
    private readonly Transform _handParent;
    private readonly HandLayout3D _handLayout;
    private readonly List<CardInstance> _tmpRemove = new();

    public HandRenderer(ViewRegistry registry, Transform handParent, HandLayout3D handLayout)
    {
        _registry = registry;
        _handParent = handParent;
        _handLayout = handLayout;
    }

    public void Render(GameState state, PlayerId viewer)
    {
        var handCards = state.GetPlayer(viewer).Hand.Cards;

        for (int i = 0; i < handCards.Count; i++)
        {
            var card = handCards[i];
            var view = _registry.GetOrCreate(card);

            view.transform.SetParent(_handParent, false);
            view.Bind(card);
            view.transform.SetSiblingIndex(i);
        }

        // Prune views whose card claims Zone.Hand but is no longer in the hand list.
        // Cards that moved to Board/Graveyard/etc. are left for the other renderers.
        _tmpRemove.Clear();
        foreach (var kv in _registry.Views)
        {
            var card = kv.Key;
            if (!handCards.Contains(card) && card.Zone == Zone.Hand)
                _tmpRemove.Add(card);
        }

        for (int i = 0; i < _tmpRemove.Count; i++)
            _registry.Remove(_tmpRemove[i]);

        if (_handLayout != null)
            _handLayout.RebuildFromChildren();
    }
}
