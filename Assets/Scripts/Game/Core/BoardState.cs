#nullable enable
using System.Collections.Generic;
using MetaDeck.Rules;

namespace MetaDeck.Core
{
    public sealed class BoardState
    {
        // 5 slots baseline (simple). You can switch to 3 lanes later.
        public CardInstance?[] P1Slots { get; } = new CardInstance?[5];
        public CardInstance?[] P2Slots { get; } = new CardInstance?[5];

        public CardInstance? GetAt(PlayerId owner, int slot)
            => owner == PlayerId.P1 ? P1Slots[slot] : P2Slots[slot];

        public void SetAt(PlayerId owner, int slot, CardInstance? card)
        {
            if (owner == PlayerId.P1) P1Slots[slot] = card;
            else P2Slots[slot] = card;
        }

        public IEnumerable<CardInstance> AllMonsters()
        {
            foreach (var c in P1Slots) if (c != null) yield return c;
            foreach (var c in P2Slots) if (c != null) yield return c;
        }
    }
}