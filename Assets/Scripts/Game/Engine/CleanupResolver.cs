using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    public sealed class CleanupResolver
    {
        private readonly ZoneService _zones;
        public CleanupResolver(ZoneService zones) => _zones = zones;

        public void CleanupDeaths(GameState state, IEventBus bus)
        {
            foreach (var monster in state.Board.AllMonsters())
            {
                if (monster.IsDestroyed)
                {
                    bus.Publish(new MonsterDestroyed(monster));
                    _zones.Move(state, monster, Zone.Board, Zone.Graveyard, bus);
                }
            }
        }
    }
}