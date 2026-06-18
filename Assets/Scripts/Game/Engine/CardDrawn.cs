// Assets/MetaDeck/Events/CardDrawn.cs
using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Events
{
    public readonly struct CardDrawn
    {
        public PlayerId Player { get; }
        public CardInstance Card { get; }

        public CardDrawn(PlayerId player, CardInstance card)
        {
            Player = player;
            Card = card;
        }
    }
}