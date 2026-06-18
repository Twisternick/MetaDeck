using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine.Commands
{
    /// <summary>
    /// Draw N cards from the active player's deck into their hand.
    /// Uses ZoneService to actually move cards and emits CardMoved, etc.
    /// </summary>
    public sealed class DrawCardsCommand : IGameCommand
    {
        private readonly PlayerId _player;
        private readonly int _count;
        private readonly ZoneService _zones;

        public DrawCardsCommand(PlayerId player, int count, ZoneService zones)
        {
            _player = player;
            _count = count < 0 ? 0 : count;
            _zones = zones;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            if (_count <= 0)
            {
                reason = "Nothing to draw.";
                return false;
            }

            if (state.ActivePlayer != _player)
            {
                reason = "Not your turn.";
                return false;
            }

            var p = state.GetPlayer(_player);
            if (p.Deck.Cards.Count <= 0)
            {
                reason = "Deck is empty.";
                return false;
            }

            // If you want a hard rule "must be able to draw full amount"
            // uncomment this:
            // if (p.Deck.Cards.Count < _count) { reason = "Not enough cards in deck."; return false; }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            var p = state.GetPlayer(_player);

            MetaDeck.Diagnostics.GameLog.Debug($"{_player} is drawing {_count} card(s). Deck has {p.Deck.Cards.Count} card(s) before draw.");

            int draws = _count;
            if (p.Deck.Cards.Count < draws) draws = p.Deck.Cards.Count;

            for (int i = 0; i < draws; i++)
            {
                // Assumption: top of deck is last element (matches common "^1" usage).
                var card = p.Deck.Cards[^1];

                // ZoneService will:
                // - remove from deck list
                // - add to hand list
                // - set card.Zone
                // - publish CardMoved (and other zone-specific events)
                _zones.Move(state, card, Zone.Deck, Zone.Hand, bus);

                // Optional explicit draw event (handy for UI sfx/analytics).
                bus.Publish(new CardDrawn(_player, card));
            }

            // Optional aggregate event (useful if you want one UI refresh instead of N).
            bus.Publish(new CardsDrawn(_player, draws));
        }
    }

    /// <summary>
    /// Discard a specific card from hand to graveyard.
    /// </summary>
    public sealed class DiscardCardCommand : IGameCommand
    {
        private readonly CardInstance _card;
        private readonly Zone _from;
        private readonly ZoneService _zones;

        public DiscardCardCommand(CardInstance card, Zone from, ZoneService zones)
        {
            _card = card;
            _from = from;
            _zones = zones;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            if (_card == null)
            {
                reason = "No card provided.";
                return false;
            }

            // If you only allow discarding from hand, enforce it here.
            // Keeping _from to mirror your PlayCardCommand pattern.
            if (_from != Zone.Hand)
            {
                reason = "Discard must be from Hand.";
                return false;
            }

            if (_card.Zone != _from)
            {
                reason = $"Card not in {_from}.";
                return false;
            }

            // If discarding is only allowed on your turn, keep this.
            // If you want "discard as cost" during either turn, remove this check.
            if (state.ActivePlayer != _card.Owner)
            {
                reason = "Not your turn.";
                return false;
            }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            // ZoneService publishes CardMoved and CardEnteredGraveyard.
            _zones.Move(state, _card, _from, Zone.Graveyard, bus);

            // Optional explicit discard event for UI/trigger rules.
            bus.Publish(new CardDiscarded(_card, _from));
        }
    }

    /// <summary>
    /// Discard N cards from the player's hand (simple: discards from end).
    /// You can swap selection logic later (random, chosen indices, etc.).
    /// </summary>
    public sealed class DiscardCardsCommand : IGameCommand
    {
        private readonly PlayerId _player;
        private readonly int _count;
        private readonly ZoneService _zones;

        public DiscardCardsCommand(PlayerId player, int count, ZoneService zones)
        {
            _player = player;
            _count = count < 0 ? 0 : count;
            _zones = zones;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            if (_count <= 0)
            {
                reason = "Nothing to discard.";
                return false;
            }

            // Often discarding is forced by effects and can happen any time.
            // If you want "only on your turn" enforce it:
            // if (state.ActivePlayer != _player) { reason = "Not your turn."; return false; }

            var p = state.GetPlayer(_player);
            if (p.Hand.Cards.Count <= 0)
            {
                reason = "Hand is empty.";
                return false;
            }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            var p = state.GetPlayer(_player);

            int discards = _count;
            if (p.Hand.Cards.Count < discards) discards = p.Hand.Cards.Count;

            for (int i = 0; i < discards; i++)
            {
                // Simple policy: discard last card in hand
                var card = p.Hand.Cards[^1];
                _zones.Move(state, card, Zone.Hand, Zone.Graveyard, bus);
                bus.Publish(new CardDiscarded(card, Zone.Hand));
            }

            bus.Publish(new CardsDiscarded(_player, discards));
        }
    }
}