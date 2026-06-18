using MetaDeck.Core;
using MetaDeck.Rules;
namespace MetaDeck.Events
{
    /// <summary>
    /// Published after one or more cards are drawn.
    /// Individual CardDrawn events may also have been published.
    /// This event represents the aggregate action.
    /// </summary>
    public sealed class CardsDrawn
    {
        public PlayerId Player { get; }
        public int Count { get; }

        public CardsDrawn(PlayerId player, int count)
        {
            Player = player;
            Count = count;
        }

        public override string ToString()
            => $"{Player} drew {Count} card(s).";
    }
}