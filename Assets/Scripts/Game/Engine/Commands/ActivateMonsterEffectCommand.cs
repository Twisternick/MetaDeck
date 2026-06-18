using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.Effects;
using System;

namespace MetaDeck.Engine.Commands
{
    /// <summary>
    /// Activate an effect on a monster that is already on the battlefield.
    /// Supports both normal-speed activations and Quick-speed chain items.
    /// </summary>
    public sealed class ActivateMonsterEffectCommand : IGameCommand
    {
        private readonly CardInstance _card;
        private readonly int _effectIndex;
        private readonly TargetSpec _target;
        private readonly bool _asChainItem;

        /// <param name="card">Monster instance on the field.</param>
        /// <param name="effectIndex">
        /// Index into card.Def.effects (or whatever array you use for activatable abilities).
        /// </param>
        /// <param name="target">Target spec for this activation.</param>
        /// <param name="asChainItem">
        /// If true, this activation is being added to the chain instead of resolving immediately.
        /// </param>
        public ActivateMonsterEffectCommand(
            CardInstance card,
            int effectIndex,
            TargetSpec target,
            bool asChainItem
        )
        {
            _card = card ?? throw new ArgumentNullException(nameof(card));
            _effectIndex = effectIndex;
            _target = target;
            _asChainItem = asChainItem;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            var player = state.GetPlayer(_card.Owner);

            if (_card.Def.type != CardType.Monster)
            {
                reason = "Card is not a Monster.";
                return false;
            }

            // Adjust this to whatever zone you use for units (Battlefield / Board / MonsterZone, etc.)
            if (_card.Zone != Zone.Board)
            {
                reason = "Monster must be on the board to activate its effect.";
                return false;
            }

            if (_effectIndex < 0 ||
                _card.Def.effects == null ||
                _effectIndex >= _card.Def.effects.Length)
            {
                reason = "Effect index out of range.";
                return false;
            }

            // Turn/priority rules
            if (!_asChainItem && state.ActivePlayer != _card.Owner)
            {
                reason = "Not your turn.";
                return false;
            }

            if (_asChainItem)
            {
                // Same Quick-speed / chain-depth logic as PlayCardCommand
                if (_card.Def.speedWindow != SpeedWindow.Quick)
                {
                    reason = "Effect is not Quick-speed.";
                    return false;
                }

                if (state.Chain.Count >= state.MaxChainDepth)
                {
                    reason = "Chain is at max depth.";
                    return false;
                }

                // If you want a "once per chain" or similar limit for monster quick effects,
                // plug it in here (similar to HandTrapsUsedThisChain).
            }
            else
            {
                // Normal-speed activation. If you have activation costs, check them here.
                // Example (pseudo):
                // if (!player.CanAfford(_card.GetActivationCost(_effectIndex)))
                // {
                //     reason = "Not enough Bandwidth for activation.";
                //     return false;
                // }
            }

            // Optional: per-turn/per-card limits (once per turn, once while this is face-up, etc.)
            // Example:
            // if (_card.HasUsedEffectThisTurn(_effectIndex))
            // {
            //     reason = "This effect has already been used this turn.";
            //     return false;
            // }

            reason = "";
            return true;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            var player = state.GetPlayer(_card.Owner);

            // Defensive: if CanExecute wasn't called, don't silently blow up.
            if (_card.Def.effects == null ||
                _effectIndex < 0 ||
                _effectIndex >= _card.Def.effects.Length)
            {
                throw new InvalidOperationException("Invalid effect index for monster activation.");
            }

            var effectDef = _card.Def.effects[_effectIndex];
            var fx = EffectFactory.Create(effectDef);

            // If you have activation costs, pay them here (mirroring PlayCardCommand):
            // if (!_asChainItem)
            // {
            //     var cost = _card.GetActivationCost(_effectIndex);
            //     var spent = player.TrySpend(cost);
            //     if (!spent)
            //     {
            //         throw new InvalidOperationException("Attempted to activate effect without enough Bandwidth.");
            //     }
            // }

            // Optional: track usage (once per turn, etc.)
            // _card.MarkEffectUsedThisTurn(_effectIndex);

            if (_asChainItem)
            {
                // Same chain behavior as spells/traps in PlayCardCommand
                state.Chain.Push(new ChainItem(_card, fx, _target, _card.Owner));
                bus.Publish(new ChainItemAdded(state.Chain.Peek(), state.Chain.Count));
            }
            else
            {
                // Immediate resolution, reusing your existing effect pipeline
                var ctx = new EffectContext(state, bus, _card, _target);
                if (fx.CanActivate(ctx, out _)) fx.Resolve(ctx);
            }

            // You can define and publish a specific event if you want:
            // bus.Publish(new MonsterEffectActivated(_card, _effectIndex));
        }
    }
}