using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Presentation;
using MetaDeck.Rules;
using UnityEngine;
using System.Linq;

public sealed class HandView3D : MonoBehaviour
{
    [SerializeField] private PlayerId owner;
    [SerializeField] private GameObject cardViewPrefab;
    [SerializeField] private HandLayout3D layout;

    private GameState state;
    private IEventBus bus;

    private readonly Dictionary<CardInstance, CardView3D> views = new();

    public void Init(GameState state, IEventBus bus)
    {
        this.state = state;
        this.bus = bus;

        // Subscribe using delegate (Action<CardMoved>)
        bus.Subscribe<CardMoved>(OnCardMoved);

        SyncFullHand();
    }

    private void OnDestroy()
    {
        if (bus != null)
            bus.Unsubscribe<CardMoved>(OnCardMoved);
    }

    private void OnCardMoved(CardMoved e)
    {
        if (e.Card.Owner != owner) return;

        if (e.From == Zone.Hand || e.To == Zone.Hand)
            SyncFullHand();
    }

    private void SyncFullHand()
    {
        var hand = state.GetPlayer(owner).Hand;

        // NOTE: based on your code, Hand has a Cards list.
        var cards = hand.Cards;

        for (int i = 0; i < cards.Count; i++)
        {
            var card = cards[i];
            if (!views.ContainsKey(card))
            {
                var go = Instantiate(cardViewPrefab, transform);
                var view = go.GetComponent<CardView3D>();
                view.Bind(card);
                views.Add(card, view);
            }
        }

        var toRemove = views.Keys.Except(cards).ToList();
        foreach (var card in toRemove)
        {
            Destroy(views[card].gameObject);
            views.Remove(card);
        }

        for (int i = 0; i < cards.Count; i++)
            views[cards[i]].transform.SetSiblingIndex(i);

        layout.RebuildFromChildren();
    }
}