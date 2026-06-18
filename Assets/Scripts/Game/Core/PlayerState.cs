using System;
using MetaDeck.Rules;

namespace MetaDeck.Core
{
    public sealed class PlayerState
    {
        public PlayerId Id { get; }
        public int Hp { get; set; } = 30;

        // Hearthstone-like resource
        public int MaxBandwidth { get; set; } = 0;
        private int _bandwidth = 0;
        public int Bandwidth
        {
            get => _bandwidth;
            set
            {
                if (_bandwidth != value)
                {
                    _bandwidth = value;
                    OnBandwidthChanged?.Invoke(_bandwidth);
                }
            }
        }

        public ZoneList Deck { get; } = new(Zone.Deck);
        public ZoneList Hand { get; } = new(Zone.Hand);
        public ZoneList Graveyard { get; } = new(Zone.Graveyard);
        public ZoneList Exile { get; } = new(Zone.Void);

        // Racing archetype resource, gained from GainNitro effects and startingNitro on summoned cards.
        public int Nitro { get; set; } = 0;

        public int CardsPlayedThisTurn { get; set; } = 0;

        // Graveyard limiter (anti-degeneracy)
        public int GraveyardPlaysThisTurn { get; set; } = 0;
        public int GraveyardPlaysLimit { get; set; } = 1;

        // Chain limiter
        public int HandTrapsUsedThisChain { get; set; } = 0;

        // Escalating self-damage taken when drawing from an empty deck (deck-out).
        public int FatigueCounter { get; set; } = 0;

        public bool CanAfford(int cost) => Bandwidth >= cost;

        public bool TrySpend(int cost)
        {
            if (!CanAfford(cost)) return false;
            Bandwidth -= cost;
            return true;
        }

        public void AddBandwidth(int amount)
        {
            MaxBandwidth += amount;
            Bandwidth += amount;
        }

        public void SetMaxBandwidth(int newMax)
        {
            MaxBandwidth = newMax;
            if (Bandwidth > MaxBandwidth) Bandwidth = MaxBandwidth;
        }

        public void FillBandwidth() => Bandwidth = MaxBandwidth;
        // Create a OnBandwidthChanged event if you want to notify UI of changes when bandwidth is modified.
        public event Action<int> OnBandwidthChanged;

        public PlayerState(PlayerId id, int hp = 30)
        {
            Id = id;
            Hp = hp;
        }
    }
}