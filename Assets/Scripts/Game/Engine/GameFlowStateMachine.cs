using System;
using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Effects;
using MetaDeck.Rules;
using System.Collections.Generic;

namespace MetaDeck.Engine
{
    public sealed class GameFlowStateMachine
    {
        public GamePhase Phase { get; private set; }

        private readonly GameEngine _engine;
        private readonly IEventBus _bus;

        private readonly ChainPriority _priority;
        private PendingAction _pending;

        public GameFlowStateMachine(GameEngine engine, IEventBus bus)
        {
            _engine = engine;
            _bus = bus;

            _priority = new ChainPriority();
            _pending = PendingAction.None();
            Phase = GamePhase.Main;
        }

        public PlayerId PriorityPlayer
        {
            get { return _priority.PriorityPlayer; }
        }

        public bool IsInChainWindow
        {
            get { return Phase == GamePhase.ChainResponse; }
        }

        // ----------------------------
        // Entry points that open chain
        // ----------------------------

        /// <summary>
        /// Begin an attack: opens chain window before combat resolves.
        /// </summary>
        public bool BeginAttack(CardInstance attacker, CardInstance defender, out string reason)
        {
            if (Phase != GamePhase.Main)
            {
                reason = "Cannot start an attack outside Main phase.";
                return false;
            }

            // Attacker validity + Guard/taunt legality enforced centrally.
            if (!CombatRules.CanAttackMonster(_engine.State, attacker, defender, out reason))
                return false;

            _pending = PendingAction.Attack(attacker, defender);
            OpenChainWindow();
            reason = "";
            return true;
        }

        /// <summary>Declare an attack against the opponent player directly (face).</summary>
        public bool BeginAttackFace(CardInstance attacker, out string reason)
        {
            if (Phase != GamePhase.Main)
            {
                reason = "Cannot start an attack outside Main phase.";
                return false;
            }

            if (!CombatRules.CanAttackFace(_engine.State, attacker, out reason))
                return false;

            var face = _engine.State.OpponentOf(attacker.Owner);
            _pending = PendingAction.AttackFace(attacker, face);
            OpenChainWindow();
            reason = "";
            return true;
        }

        // ----------------------------
        // Immediate combat (no chain window). Used by BeginAttackCommand so attacks resolve on
        // declaration and the phase stays Main. The chain-window methods above remain available if a
        // response/hand-trap system is enabled later. Validity is checked in the command's CanExecute.
        // ----------------------------

        public void ResolveAttackNow(CardInstance attacker, CardInstance defender)
        {
            _engine.Combat.ResolveAttack(_engine.State, attacker, defender, _bus);
        }

        public void ResolveFaceAttackNow(CardInstance attacker)
        {
            var face = _engine.State.OpponentOf(attacker.Owner);
            _engine.Combat.ResolveFaceAttack(_engine.State, attacker, face, _bus);
        }

        // ----------------------------
        // Chain window actions
        // ----------------------------

        /// <summary>
        /// Add a Quick effect to the chain from a card (typically from hand).
        /// IMPORTANT: This method expects the caller already validated it's legal to play the response.
        /// </summary>
        public bool AddChainItem(CardInstance source, IEffect effect, TargetSpec target, out string reason)
        {
            if (Phase != GamePhase.ChainResponse)
            {
                reason = "Not in a chain response window.";
                return false;
            }

            var state = _engine.State;

            // Must have priority to add to chain
            if (source.Owner != _priority.PriorityPlayer)
            {
                reason = "You do not have priority.";
                return false;
            }

            if (state.Chain.Count >= state.MaxChainDepth)
            {
                reason = "Chain is at max depth.";
                return false;
            }

            // Per-chain hand trap limiter
            // (You can refine this: only count if card came from hand + quick)
            var p = state.GetPlayer(source.Owner);
            if (p.HandTrapsUsedThisChain >= 1)
            {
                reason = "Hand trap limit reached for this chain.";
                return false;
            }

            // Register usage and push to stack
            p.HandTrapsUsedThisChain++;

            var item = new ChainItem(source, effect, target, source.Owner);
            state.Chain.Push(item);

            _bus.Publish(new ChainItemAdded(item, state.Chain.Count));

            // When you add to chain, passing flags reset (because chain advanced)
            ResetPassFlagsKeepPriority();

            // After adding, priority passes to the other player
            _priority.SwitchPriority(state.OpponentOf(_priority.PriorityPlayer));

            reason = "";
            return true;
        }

        /// <summary>
        /// Pass priority. If both players pass consecutively, resolve the chain then pending action.
        /// </summary>
        public bool PassPriority(out string reason)
        {
            if (Phase != GamePhase.ChainResponse)
            {
                reason = "Not in a chain response window.";
                return false;
            }

            var state = _engine.State;
            var active = state.ActivePlayer;
            var passing = _priority.PriorityPlayer;

            _priority.MarkPass(active, passing);

            if (_priority.BothPassed())
            {
                // Lock in: resolve chain, then pending action
                ResolveAll();
            }
            else
            {
                // Swap priority to opponent
                _priority.SwitchPriority(state.OpponentOf(passing));
            }

            reason = "";
            return true;
        }

        // ----------------------------
        // Internals
        // ----------------------------

        private void OpenChainWindow()
        {
            var state = _engine.State;

            // Reset per-chain counters
            state.GetPlayer(PlayerId.P1).HandTrapsUsedThisChain = 0;
            state.GetPlayer(PlayerId.P2).HandTrapsUsedThisChain = 0;

            _priority.Reset(state.ActivePlayer);

            Phase = GamePhase.ChainResponse;
            _bus.Publish(new ChainOpened(state.ActivePlayer));
        }

        private void ResolveAll()
        {
            // Resolve chain (if any), then pending action, then cleanup.
            ResolveChain();
            ResolvePendingAction();
            DoCleanup();

            // Return to main
            _pending = PendingAction.None();
            Phase = GamePhase.Main;

            _bus.Publish(new ChainResolved(0)); // Optional: you can publish exact count in ResolveChain.
        }

        private void ResolveChain()
        {
            Phase = GamePhase.ResolvingChain;

            var state = _engine.State;
            int resolved = 0;

            // Resolve LIFO
            while (state.Chain.Count > 0)
            {
                var item = state.Chain.Pop();

                var ctx = new EffectContext(state, _bus, item.Source, item.Target);

                string reason;
                if (item.Effect.CanActivate(ctx, out reason))
                {
                    item.Effect.Resolve(ctx);
                }

                // After each resolution step, clean deaths (important!)
                _engine.Cleanup.CleanupDeaths(state, _bus);

                // Chain-played spells/traps go to the graveyard once resolved.
                // (Monster effect activations also ride the chain as ChainItems whose Source is the
                // monster — those must stay on the board, hence the type + Hand guard.)
                if (item.Source.Def.type != CardType.Monster && item.Source.Zone == Zone.Hand)
                {
                    _engine.Zones.Move(state, item.Source, Zone.Hand, Zone.Graveyard, _bus);
                }

                resolved++;
            }

            _bus.Publish(new ChainResolved(resolved));
        }

        private void ResolvePendingAction()
        {
            var state = _engine.State;

            if (_pending == null || _pending.Type == PendingActionType.None)
                return;

            if (_pending.Type == PendingActionType.Attack)
            {
                // Re-validate because chain effects may have killed/moved things.
                var attacker = _pending.Attacker;
                if (attacker == null || attacker.Zone != Zone.Board || attacker.IsDestroyed) return;

                if (_pending.DefenderPlayer.HasValue)
                {
                    // Face attack — re-check Guard in case a Guard entered play during the chain.
                    if (CombatRules.HasGuard(state, _pending.DefenderPlayer.Value)) return;
                    _engine.Combat.ResolveFaceAttack(state, attacker, _pending.DefenderPlayer.Value, _bus);
                }
                else
                {
                    var defender = _pending.Defender;
                    if (defender == null || defender.Zone != Zone.Board || defender.IsDestroyed) return;
                    _engine.Combat.ResolveAttack(state, attacker, defender, _bus);
                }
            }
        }

        private void DoCleanup()
        {
            Phase = GamePhase.Cleanup;
            _engine.Cleanup.CleanupDeaths(_engine.State, _bus);
        }

        private void ResetPassFlagsKeepPriority()
        {
            // easiest: just reset the whole object then re-set current priority
            var state = _engine.State;
            var current = _priority.PriorityPlayer;

            _priority.Reset(state.ActivePlayer);
            _priority.SwitchPriority(current);
        }
    }
}