using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine.Commands
{
    /// <summary>
    /// Destroys a monster and moves it to Graveyard (typically from Board).
    /// Intended for use by effects/keywords (so it does NOT enforce "your turn").
    /// </summary>
    public sealed class DestroyMonsterCommand : IGameCommand
    {
        private readonly CardInstance _target;
        private readonly ZoneService _zones;

        // Optional: enforce "must be damaged" (Headshot can use this)
        private readonly bool _requireDamaged;

        public DestroyMonsterCommand(CardInstance target, ZoneService zones, bool requireDamaged = false)
        {
            _target = target;
            _zones = zones;
            _requireDamaged = requireDamaged;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            if (_target == null)
            {
                reason = "No target.";
                return false;
            }

            if (_target.Def.type != CardType.Monster)
            {
                reason = "Target is not a monster.";
                return false;
            }

            // Usually you only "destroy" monsters on board.
            // If you want to allow destroying monsters in Hand/Deck for special cards, relax this.
            if (_target.Zone != Zone.Board)
            {
                reason = "Target is not on the board.";
                return false;
            }

            if (_target.IsDestroyed)
            {
                reason = "Target already destroyed.";
                return false;
            }

            if (_requireDamaged)
            {
                // "Damaged" = current health less than base health.
                // If your game has buffs that change max health, replace with MaxHealth.
                if (_target.GetHealth() >= _target.GetMaxHealth())
                {
                    reason = "Target is not damaged.";
                    return false;
                }
            }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            // Ensure state reflects destruction even if it wasn't lethal damage.
            // (If destruction is purely "move to graveyard", you can remove this.)
            if (_target.Health > 0)
                _target.Health = 0;

            // Route through ZoneService so you get CardMoved / CardEnteredGraveyard events consistently.
            _zones.Move(state, _target, Zone.Board, Zone.Graveyard, bus);

            // Optional explicit event if you want (only if you already have something like this):
            // bus.Publish(new MonsterDestroyed(_target));
        }
    }
}