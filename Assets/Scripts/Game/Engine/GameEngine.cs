using MetaDeck.Core;
using MetaDeck.Effects;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.UI;

namespace MetaDeck.Engine
{
    public sealed class GameEngine
    {
        public GameState State { get; }
        public IEventBus Bus { get; }

        public readonly ZoneService Zones = new();
        public readonly CombatResolver Combat = new();
        public readonly TargetingService Targeting = new();
        public readonly EffectRunner Effects;  
        public readonly CleanupResolver Cleanup;

        public GameEngine(GameState state, IEventBus bus)
        {
            State = state;
            Bus = bus;
            Effects = new EffectRunner(new RulesQueryService(), Targeting);
            Cleanup = new CleanupResolver(Zones);
        }

        public bool Submit(IGameCommand cmd, out string reason)
        {
            if (State.IsOver)
            {
                reason = "The match is over.";
                return false;
            }

            // print out reason for failed command in the console for debugging
            if (!cmd.CanExecute(State, out reason))
            {
                MetaDeck.Diagnostics.GameLog.Debug($"Command {cmd.GetType().Name} failed: {reason}");
                return false;
            }

            cmd.Execute(State, Bus);

            // After any command, clean up deaths (important for effect damage)
            Cleanup.CleanupDeaths(State, Bus);

            // Then check whether anyone has been reduced to 0 HP (face damage, effects, fatigue).
            CheckGameOver();
            return true;
        }

        private void CheckGameOver()
        {
            if (State.IsOver) return;

            bool p1Dead = State.GetPlayer(PlayerId.P1).Hp <= 0;
            bool p2Dead = State.GetPlayer(PlayerId.P2).Hp <= 0;
            if (!p1Dead && !p2Dead) return;

            PlayerId? winner = (p1Dead && p2Dead) ? (PlayerId?)null : (p1Dead ? PlayerId.P2 : PlayerId.P1);
            State.IsOver = true;
            State.Winner = winner;
            Bus.Publish(new GameOver(winner, winner == null ? "Both players defeated — draw." : $"{winner} wins."));
        }
    }
}