using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    public sealed class ChainPriority
    {
        public PlayerId PriorityPlayer { get; private set; }
        public bool ActivePlayerPassed { get; private set; }
        public bool NonActivePlayerPassed { get; private set; }

        public void Reset(PlayerId activePlayer)
        {
            PriorityPlayer = activePlayer;
            ActivePlayerPassed = false;
            NonActivePlayerPassed = false;
        }

        public void MarkPass(PlayerId activePlayer, PlayerId passingPlayer)
        {
            if (passingPlayer == activePlayer) ActivePlayerPassed = true;
            else NonActivePlayerPassed = true;
        }

        public bool BothPassed()
        {
            return ActivePlayerPassed && NonActivePlayerPassed;
        }

        public void SwitchPriority(PlayerId next)
        {
            PriorityPlayer = next;
        }
    }
}