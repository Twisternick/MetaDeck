using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine.Commands
{
    public sealed class EndTurnCommand : IGameCommand
    {
        private readonly ZoneService _zones;

        public EndTurnCommand(ZoneService zones)
        {
            _zones = zones;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            var active = state.ActivePlayer;
            bus.Publish(new TurnEnded(active, state.TurnNumber));

            // Switch player
            state.ActivePlayer = state.OpponentOf(active);
            state.TurnNumber++;

            // Refresh per-turn counters
            foreach (var p in state.Players)
            {
                p.CardsPlayedThisTurn = 0;
                p.GraveyardPlaysThisTurn = 0;
                p.HandTrapsUsedThisChain = 0;
            }

            // Increase bandwidth like Hearthstone (cap 10)
            var ap = state.GetPlayer(state.ActivePlayer);
            ap.MaxBandwidth = System.Math.Min(10, ap.MaxBandwidth + 1);
            ap.Bandwidth = ap.MaxBandwidth;

            bus.Publish(new TurnStarted(state.ActivePlayer, state.TurnNumber));

            // Start-of-turn draw for the new active player (deck-out -> escalating fatigue).
            DrawForTurn(state, ap, bus);
        }

        private void DrawForTurn(GameState state, PlayerState player, IEventBus bus)
        {
            if (player.Deck.Cards.Count > 0)
            {
                var top = player.Deck.Cards[player.Deck.Cards.Count - 1];
                _zones.Move(state, top, Zone.Deck, Zone.Hand, bus);
            }
            else
            {
                // Fatigue: each empty-deck draw deals 1 more than the last.
                player.FatigueCounter++;
                player.Hp -= player.FatigueCounter;
                bus.Publish(new PlayerDamaged(null, player.Id, player.FatigueCounter));
            }
        }
    }
}