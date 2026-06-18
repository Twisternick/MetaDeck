using MetaDeck.Core;
using MetaDeck.Engine;
using MetaDeck.Rules;

namespace MetaDeck.Protocol
{
    /// <summary>
    /// Server-side: projects the authoritative <see cref="GameState"/> into a per-viewer
    /// <see cref="SnapshotDto"/>, hiding the opponent's hand contents (only the count is sent).
    /// Pure (no Unity).
    /// </summary>
    public static class SnapshotBuilder
    {
        public static SnapshotDto Build(GameState state, PlayerId viewer,
                                        GamePhase phase = GamePhase.Main, PlayerId priorityPlayer = PlayerId.P1)
        {
            return new SnapshotDto
            {
                Viewer = viewer,
                TurnNumber = state.TurnNumber,
                ActivePlayer = state.ActivePlayer,
                IsOver = state.IsOver,
                Winner = state.Winner,
                Phase = phase,
                PriorityPlayer = priorityPlayer,
                ChainDepth = state.Chain.Count,
                Players = new[]
                {
                    BuildPlayer(state, PlayerId.P1, viewer),
                    BuildPlayer(state, PlayerId.P2, viewer)
                }
            };
        }

        private static PlayerViewDto BuildPlayer(GameState state, PlayerId pid, PlayerId viewer)
        {
            var p = state.GetPlayer(pid);
            var view = new PlayerViewDto
            {
                Id = pid,
                Hp = p.Hp,
                Bandwidth = p.Bandwidth,
                MaxBandwidth = p.MaxBandwidth,
                FatigueCounter = p.FatigueCounter,
                DeckCount = p.Deck.Cards.Count,
                HandCount = p.Hand.Cards.Count
            };

            // Hidden information: only the viewing player sees their own hand cards.
            if (pid == viewer)
            {
                foreach (var c in p.Hand.Cards)
                    view.Hand.Add(ToCardDto(c));
            }

            // Board and graveyard are public.
            for (int slot = 0; slot < 5; slot++)
            {
                var c = state.Board.GetAt(pid, slot);
                if (c != null) view.Board.Add(ToCardDto(c, slot));
            }

            foreach (var c in p.Graveyard.Cards)
                view.Graveyard.Add(ToCardDto(c));

            return view;
        }

        public static CardDto ToCardDto(CardInstance c, int slotIndex = -1)
        {
            var keywords = new Keyword[c.Keywords.Count];
            c.Keywords.CopyTo(keywords);

            return new CardDto
            {
                InstanceId = c.InstanceId,
                CardId = c.Def.cardId,
                Owner = c.Owner,
                Zone = c.Zone,
                Type = c.Def.type,
                SlotIndex = slotIndex,
                Attack = c.GetAttack(),
                Health = c.GetHealth(),
                MaxHealth = c.GetMaxHealth(),
                CurrentCost = c.CurrentCost,
                Keywords = keywords,
                SummonedTurn = c.SummonedTurn
            };
        }
    }
}
