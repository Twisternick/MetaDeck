using UnityEngine;

using MetaDeck.Core;
using MetaDeck.Engine;
using MetaDeck.Engine.Commands;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    public sealed class GameCommandFacadeMB : MonoBehaviour
    {
        [SerializeField] private GameHostMB game;

        private void Awake()
        {
            if (game == null) game = FindFirstObjectByType<GameHostMB>();
        }

        public bool TryEndTurn(out string reason)
            => Submit(new EndTurnCommand(game.Engine.Zones), out reason);

        public bool TryPlayCard(CardInstance card, Zone from, TargetSpec target, bool asChainItem, out string reason)
            => Submit(new PlayCardCommand(card, from, target, asChainItem, game.Engine.Zones), out reason);

        public bool TrySummonMonster(CardInstance card, Zone from, int boardSlot, out string reason)
            => Submit(new SummonMonsterCommand(card, from, boardSlot, game.Engine.Zones, game.Engine.Effects), out reason);

        public bool TryPassPriority(out string reason)
            => Submit(new PassPriorityCommand(game.Flow), out reason);

        public bool TryRespondQuickFromHand(CardInstance card, TargetSpec target, out string reason)
            => Submit(new RespondQuickFromHandCommand(game.Flow, card, target), out reason);

        public bool TryBeginAttack(CardInstance attacker, CardInstance defender, out string reason)
            => Submit(new BeginAttackCommand(game.Flow, attacker, defender), out reason);

        public bool TryBeginAttackFace(CardInstance attacker, out string reason)
            => Submit(new BeginAttackCommand(game.Flow, attacker), out reason);

        /// <summary>Attack the enemy monster occupying the given slot on the opponent's board.</summary>
        public bool TryAttackEnemySlot(CardInstance attacker, int enemySlotIndex, out string reason)
        {
            reason = "";
            if (game == null || game.State == null) { reason = "Game not initialized."; return false; }

            var opp = game.State.OpponentOf(attacker.Owner);
            var defender = game.State.Board.GetAt(opp, enemySlotIndex);
            if (defender == null) { reason = "No enemy monster in that slot."; return false; }

            return Submit(new BeginAttackCommand(game.Flow, attacker, defender), out reason);
        }

        private bool Submit(IGameCommand cmd, out string reason)
        {
            reason = "";
            if (game == null || game.Engine == null)
            {
                reason = "Game not initialized.";
                return false;
            }
            return game.Engine.Submit(cmd, out reason);
        }
    }
}