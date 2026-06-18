using System.Collections.Generic;
using System.Linq;
using MetaDeck.Core;

namespace MetaDeck.Rules.Keywords.Service
{
    /// <summary>
    /// Enumerates only board cards as keyword hosts.
    /// Adjust this to match your board structure.
    /// </summary>
    public sealed class BoardOnlyCardQuery : ICardQuery
    {
        public IEnumerable<CardInstance> EnumerateKeywordHosts(GameState state)
        {
            // Replace with your real board traversal.
            // Common patterns you might have:

            // Pattern 1: state.Board.GetAt(playerId, slot)
            // for each player and each slot.

            // Pattern 2: state.Board.Slots[playerId] array/list.

            // I can't write the exact loop without your Board API,
            // but here's the intended structure:


            for (int slot = 0; slot < state.Board.P1Slots.Count(); slot++)
            {
                var card = state.Board.GetAt(state.Players[0].Id, slot);
                if (card != null)
                    yield return card;
            }

            for (int slot = 0; slot < state.Board.P2Slots.Count(); slot++)
            {
                var card = state.Board.GetAt(state.Players[1].Id, slot);
                if (card != null)
                    yield return card;
            }


        }
    }
}