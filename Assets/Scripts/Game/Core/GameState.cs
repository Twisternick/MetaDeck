using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Core
{
    public sealed partial class GameState
    {
        public int TurnNumber { get; set; } = 1;
        public PlayerId ActivePlayer { get; set; } = PlayerId.P1;

        public PlayerState[] Players { get; }
        public BoardState Board { get; } = new();
        public ChainStack Chain { get; } = new();

        // Global chain rules
        public int MaxChainDepth { get; set; } = 4;

        // Match end state. IsOver gates further commands; Winner is null on a draw.
        public bool IsOver { get; set; } = false;
        public PlayerId? Winner { get; set; } = null;

        public GameState(PlayerState p1, PlayerState p2)
        {
            Players = new[] { p1, p2 };
        }

        public PlayerState GetPlayer(PlayerId id) => Players[(int)id];
        public PlayerId OpponentOf(PlayerId id) => id == PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;
    }
}