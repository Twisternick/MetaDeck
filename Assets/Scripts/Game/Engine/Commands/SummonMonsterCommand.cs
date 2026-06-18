using MetaDeck.Core;
using MetaDeck.Effects;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine.Commands
{
    public sealed class SummonMonsterCommand : IGameCommand
    {
        private readonly CardInstance _monster;
        private readonly Zone _from;
        private readonly int _slot;
        private readonly ZoneService _zones;
        private readonly TargetSpec _target;

        private readonly EffectRunner _effects;

        public SummonMonsterCommand(CardInstance monster, Zone from, int slot, ZoneService zones, EffectRunner effects, TargetSpec target = default)
        {
            _monster = monster;
            _from = from;
            _slot = slot;
            _zones = zones;
            _effects = effects;
            _target = target;
            // For now, we assume summon effects don't take targets. Adjust as needed.
        }

        public bool CanExecute(GameState state, out string reason)
        {
            var p = state.GetPlayer(_monster.Owner);

            if (state.ActivePlayer != _monster.Owner)
            {
                reason = "Not your turn.";
                return false;
            }

            if (_monster.Def.type != CardType.Monster)
            {
                reason = "Not a monster.";
                return false;
            }

            if (_monster.Zone != _from)
            {
                reason = $"Card not in {_from}.";
                return false;
            }

            if (state.Board.GetAt(_monster.Owner, _slot) != null)
            {
                reason = "Slot occupied.";
                return false;
            }

            if (_from == Zone.Graveyard && p.GraveyardPlaysThisTurn >= p.GraveyardPlaysLimit)
            {
                reason = "Graveyard summon limit reached.";
                return false;
            }

            if (p.Bandwidth < _monster.CurrentCost)
            {
                reason = "Not enough Bandwidth.";
                return false;
            }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            MetaDeck.Diagnostics.GameLog.Debug($"SummonMonsterCommand bus = {bus.GetType().Name}");
            var p = state.GetPlayer(_monster.Owner);

            p.Bandwidth -= _monster.CurrentCost;
            p.CardsPlayedThisTurn++;
            if (_from == Zone.Graveyard) p.GraveyardPlaysThisTurn++;
            if (_monster.Def.startingNitro > 0) p.Nitro += _monster.Def.startingNitro;

            _zones.SummonMonsterToSlot(state, _monster, _from, _slot, bus);

            MetaDeck.Diagnostics.GameLog.Debug($"{_monster.Owner} is summoning {_monster.Def.displayName} to slot {_slot} from {_from}.");

            // Run ALL effects (ETB / on-summon style), with logging if something blocks.
            if (_monster.Def.effects != null && _monster.Def.effects.Length > 0)
            {
                if (!_effects.TryRunAll(state, bus, _monster, out var failures, _target))
                {
                    foreach (var f in failures)
                        MetaDeck.Diagnostics.GameLog.Warn($"Effect failed on {_monster.Def.displayName}: {f}");
                }
            }
        }
    }
}