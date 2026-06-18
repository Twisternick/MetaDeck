using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.UI;

namespace MetaDeck.Effects
{
    public sealed class EffectRunner
    {
        private readonly RulesQueryService _rules;
        private readonly TargetingService _targeting;

        public EffectRunner(RulesQueryService rules, TargetingService targeting)
        {
            _rules = rules;
            _targeting = targeting;
        }

        public bool TryRunAll(
            GameState state,
            IEventBus bus,
            CardInstance source,
            out List<string> failures,
            TargetSpec explicitTarget = default)
        {
            failures = null;

            var defs = source.Def.effects;
            if (defs == null || defs.Length == 0) return true;

            var ok = true;

            foreach (var def in defs)
            {
                // Silently skip effects whose game-state condition is not satisfied.
                // Per-effect conditions (TargetMustBeDamaged) pass through here and are
                // enforced inside each effect's own CanActivate instead.
                if (!_rules.CheckCondition(state, source, def.condition))
                    continue;

                // Choose target: explicit (player-selected) if provided, else build from def.targeting
                TargetSpec target;
                if (explicitTarget.Target != null) // explicit override
                {
                    target = explicitTarget;
                }
                else
                {
                    if (!_targeting.TryBuildTarget(state, source, def.targeting, out target, out var targetReason))
                    {
                        ok = false;
                        (failures ??= new List<string>()).Add($"{def.effectType}: {targetReason}");
                        continue;
                    }
                }

                var ctx = new EffectContext(state, bus, source, target);
                var fx = EffectFactory.Create(def);

                if (!fx.CanActivate(ctx, out var reason))
                {
                    ok = false;
                    (failures ??= new List<string>()).Add($"{def.effectType}: {reason}");
                    continue;
                }

                fx.Resolve(ctx);
            }

            return ok;
        }
    }
}