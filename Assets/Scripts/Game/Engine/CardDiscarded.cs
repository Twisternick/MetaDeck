using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Events
{
    public sealed class CardDiscarded
    {
        public CardInstance Card { get; }
        public PlayerId Player => Card.Owner;
        public Zone FromZone { get; }

        public CardDiscarded(CardInstance card, Zone fromZone)
        {
            Card = card;
            FromZone = fromZone;
        }

        public override string ToString()
            => $"{Player} discarded {Card} from {FromZone}.";
    }
}

