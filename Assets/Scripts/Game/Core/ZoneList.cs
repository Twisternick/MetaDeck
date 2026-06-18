using System.Collections.Generic;
using MetaDeck.Rules;

namespace MetaDeck.Core
{
    public sealed class ZoneList
    {
        public Zone Zone { get; }
        private readonly List<CardInstance> _cards = new();
        public IReadOnlyList<CardInstance> Cards => _cards;

        public ZoneList(Zone zone) => Zone = zone;

        public void Add(CardInstance c) => _cards.Add(c);
        public void Remove(CardInstance c) => _cards.Remove(c);
        public bool Contains(CardInstance c) => _cards.Contains(c);
    }
}