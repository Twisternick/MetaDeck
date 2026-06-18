using System.Collections.Generic;
using MetaDeck.Core;
using UnityEngine;

/// <summary>
/// Owns the CardInstance -> CardView3D mapping and the create/destroy lifecycle
/// for card views. Plain (non-MonoBehaviour) helper shared by the hand/board renderers
/// so they don't fight over the cache. Constructed and owned by GameUIBinderMB.
/// </summary>
public sealed class ViewRegistry
{
    private readonly Dictionary<CardInstance, CardView3D> _views = new();
    private readonly CardView3D _prefab;
    private readonly Transform _spawnParent;

    public ViewRegistry(CardView3D prefab, Transform spawnParent)
    {
        _prefab = prefab;
        _spawnParent = spawnParent;
    }

    /// <summary>Live view map; enumerate for cleanup passes.</summary>
    public IReadOnlyDictionary<CardInstance, CardView3D> Views => _views;

    public bool TryGet(CardInstance card, out CardView3D view) => _views.TryGetValue(card, out view);

    public CardView3D GetOrCreate(CardInstance card)
    {
        if (_views.TryGetValue(card, out var existing) && existing != null)
            return existing;

        var view = Object.Instantiate(_prefab, _spawnParent);
        view.Bind(card);
        _views[card] = view;
        return view;
    }

    public void Remove(CardInstance card)
    {
        if (!_views.TryGetValue(card, out var view)) return;
        if (view != null) Object.Destroy(view.gameObject);
        _views.Remove(card);
    }
}
