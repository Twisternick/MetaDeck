using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.Effects;
using System;

namespace MetaDeck.Engine.Commands
{
    public sealed class PlayCardCommand : IGameCommand
    {
        private readonly CardInstance _card;
        private readonly Zone _from;
        private readonly TargetSpec _target;
        private readonly bool _asChainItem;
        private readonly ZoneService _zones;

        public PlayCardCommand(CardInstance card, Zone from, TargetSpec target, bool asChainItem, ZoneService zones)
        {
            _card = card;
            _from = from;
            _target = target;
            _asChainItem = asChainItem;
            _zones = zones;
        }

        public bool CanExecute(GameState state, out string reason)
        {
            var player = state.GetPlayer(_card.Owner);

            if (state.ActivePlayer != _card.Owner)
            {
                reason = "Not your turn.";
                return false;
            }

            if (_card.Zone != _from)
            {
                reason = $"Card not in {_from}.";
                return false;
            }

            if (_from == Zone.Graveyard && player.GraveyardPlaysThisTurn >= player.GraveyardPlaysLimit)
            {
                reason = "Graveyard play limit reached.";
                return false;
            }

            if (_asChainItem)
            {
                if (_card.Def.speedWindow != SpeedWindow.Quick)
                {
                    reason = "Card is not Quick.";
                    return false;
                }

                if (state.Chain.Count >= state.MaxChainDepth)
                {
                    reason = "Chain is at max depth.";
                    return false;
                }

                // Simple "hand trap" limiter: if Quick + played from hand during opponent action
                // You can formalize this later with tags.
                if (_from == Zone.Hand && player.HandTrapsUsedThisChain >= 1)
                {
                    reason = "Hand trap limit reached for this chain.";
                    return false;
                }
            }
            else
            {
                // normal play cost check (Tax: enemy Tax monsters raise the cost of our spells)
                if (!player.CanAfford(EffectiveCost(state)))
                {
                    reason = "Not enough Bandwidth.";
                    return false;
                }
            }

            reason = "";
            return true;
        }

        // Bandwidth actually charged: base CurrentCost plus +1 per enemy Tax monster (spells only).
        private int EffectiveCost(GameState state)
        {
            int cost = _card.CurrentCost;
            if (_card.Def.type == CardType.Spell)
                cost += SpellTaxAgainst(state, _card.Owner);
            return cost;
        }

        private static int SpellTaxAgainst(GameState state, PlayerId owner)
        {
            var enemy = state.OpponentOf(owner);
            int tax = 0;
            for (int slot = 0; slot < 5; slot++)
            {
                var m = state.Board.GetAt(enemy, slot);
                if (m != null && !m.IsDestroyed && m.HasKeyword(Keyword.Tax)) tax++;
            }
            return tax;
        }

        public void Execute(GameState state, IEventBus bus)
        {
            var player = state.GetPlayer(_card.Owner);

            if (_from == Zone.Graveyard) player.GraveyardPlaysThisTurn++;
            if (_asChainItem && _from == Zone.Hand) player.HandTrapsUsedThisChain++;

            if (!_asChainItem)
            {
                int cost = EffectiveCost(state);
                MetaDeck.Diagnostics.GameLog.Debug($"PlayCardCommand: Attempting to spend bandwidth for {_card.Def.displayName}, cost {cost}, player bandwidth after spend: {player.Bandwidth}");
                var spent = player.TrySpend(cost);

                if (!spent)
                {
                    // This should not happen if CanExecute was called before Execute on server;
                    // but handle defensively.
                    throw new InvalidOperationException("Attempted to execute PlayCardCommand without enough bandwidth.");
                }
                player.CardsPlayedThisTurn++;
            }

            bus.Publish(new CardPlayed(_card, _from));

            // Spell/trap resolves via chain or immediate.
            // Monster summons should be done via SummonMonsterCommand (needs slot).
            if (_card.Def.type != CardType.Monster)
            {
                // For baseline: resolve first effect only
                if (_card.Def.effects != null && _card.Def.effects.Length > 0)
                {
                    var fx = EffectFactory.Create(_card.Def.effects[0]);
                    if (_asChainItem)
                    {
                        // Stays in hand until the chain resolves; GameFlowStateMachine moves it
                        // to the graveyard when the chain item resolves.
                        state.Chain.Push(new ChainItem(_card, fx, _target, _card.Owner));
                        bus.Publish(new ChainItemAdded(state.Chain.Peek(), state.Chain.Count));
                    }
                    else
                    {
                        var ctx = new EffectContext(state, bus, _card, _target);
                        if (fx.CanActivate(ctx, out _)) fx.Resolve(ctx);
                    }
                }

                // Immediately-played spells/traps go to the graveyard after resolving.
                // (Chain items are deferred to chain resolution above.)
                if (!_asChainItem && _zones != null && _card.Zone == Zone.Hand)
                {
                    _zones.Move(state, _card, Zone.Hand, Zone.Graveyard, bus);
                }
            }
        }
    }
}