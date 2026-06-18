using System.Collections.Generic;
using UnityEngine;
using MetaDeck.Core;
using MetaDeck.Rules;

public sealed class GraveyardPanelMB : MonoBehaviour
{
    public Transform contentParent;
    public CardViewMB cardPrefab;

    private readonly List<CardViewMB> _spawned = new List<CardViewMB>();

    public System.Action<CardViewMB> OnCardClicked;

    public void Show(GameState state, PlayerId playerId)
    {
        gameObject.SetActive(true);
        Rebuild(state, playerId);
    }

    public void Hide()
    {
        gameObject.SetActive(false);
        Clear();
    }

    public void Rebuild(GameState state, PlayerId playerId)
    {
        Clear();
        if (state == null) return;

        var g = state.GetPlayer(playerId).Graveyard.Cards;
        for (int i = 0; i < g.Count; i++)
        {
            var c = g[i];
            var view = Instantiate(cardPrefab, contentParent);
            view.handIndex = -1;
            view.Bind(c, c.Def.displayName, c.CurrentCost, c.GetAttack(), c.GetHealth(), c.GetMaxHealth(), c.Keywords, c.Def);

            view.OnClicked += HandleClick;
            _spawned.Add(view);
        }
    }

    private void HandleClick(CardViewMB view)
    {
        if (OnCardClicked != null) OnCardClicked(view);
    }

    private void Clear()
    {
        for (int i = 0; i < _spawned.Count; i++)
        {
            if (_spawned[i] != null)
                Destroy(_spawned[i].gameObject);
        }
        _spawned.Clear();
    }
}