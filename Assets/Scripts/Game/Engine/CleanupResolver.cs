using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    public sealed class CleanupResolver
    {
        // Counter key: pending haunt damage a monster takes at the end of its controller's next turn.
        public const string HauntedCounterKey = "Haunted";

        private static readonly System.Random _rng = new();

        private readonly ZoneService _zones;
        public CleanupResolver(ZoneService zones) => _zones = zones;

        public void CleanupDeaths(GameState state, IEventBus bus)
        {
            foreach (var monster in state.Board.AllMonsters())
            {
                if (!monster.IsDestroyed) continue;

                // Checkpoint: the first time it would die it instead survives at 1 HP and loses Checkpoint.
                if (monster.HasKeyword(Keyword.Checkpoint))
                {
                    monster.Keywords.Remove(Keyword.Checkpoint);
                    monster.RemoveKeywordThisTurn(Keyword.Checkpoint);
                    monster.Health += 1 - monster.GetHealth(); // bring GetHealth() back up to 1
                    continue;
                }

                // Haunt: on death, curse a random surviving enemy monster (ticks for 1 at end of its turn).
                if (monster.HasKeyword(Keyword.Haunt))
                    ApplyHaunt(state, monster);

                bus.Publish(new MonsterDestroyed(monster));
                _zones.Move(state, monster, Zone.Board, Zone.Graveyard, bus);
            }
        }

        private void ApplyHaunt(GameState state, CardInstance deadMonster)
        {
            var enemy = state.OpponentOf(deadMonster.Owner);
            var candidates = new List<CardInstance>();
            for (int slot = 0; slot < 5; slot++)
            {
                var m = state.Board.GetAt(enemy, slot);
                if (m != null && !m.IsDestroyed) candidates.Add(m);
            }
            if (candidates.Count == 0) return;

            var target = candidates[_rng.Next(candidates.Count)];
            target.Counters.TryGetValue(HauntedCounterKey, out var cur);
            target.Counters[HauntedCounterKey] = cur + 1;
        }
    }
}
