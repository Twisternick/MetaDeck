using MetaDeck.Rules;
namespace MetaDeck.Events
{
    /// <summary>
    /// Published after one or more cards are discarded.
    /// Individual CardDiscarded events may also have been published.
    /// This event represents the aggregate action.
    /// </summary>
    public sealed class CardsDiscarded
    {
        public PlayerId Player { get; }
        public int Count { get; }

        public CardsDiscarded(PlayerId player, int count)
        {
            Player = player;
            Count = count;
        }

        public override string ToString()
            => $"{Player} discarded {Count} card(s).";
    }
}