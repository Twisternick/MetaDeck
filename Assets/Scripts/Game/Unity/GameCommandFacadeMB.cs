using UnityEngine;

using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Builds wire <see cref="CommandDto"/>s from UI actions and sends them to the authoritative server
    /// (optimistic — the server validates and the resulting snapshot drives the UI). The bool return
    /// means "sent", not "accepted".
    /// </summary>
    public sealed class GameCommandFacadeMB : MonoBehaviour
    {
        [SerializeField] private MetaDeckNetClientMB netClient;

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
        }

        public bool TryEndTurn(out string reason)
            => Send(new CommandDto { Kind = CommandKind.EndTurn }, out reason);

        public bool TryPlayCard(CardInstance card, Zone from, TargetSpec target, bool asChainItem, out string reason)
            => Send(new CommandDto { Kind = CommandKind.PlayCard, CardInstanceId = card.InstanceId, FromZone = from, Target = ToDto(target), AsChainItem = asChainItem }, out reason);

        public bool TrySummonMonster(CardInstance card, Zone from, int boardSlot, out string reason)
            => Send(new CommandDto { Kind = CommandKind.SummonMonster, CardInstanceId = card.InstanceId, FromZone = from, BoardSlot = boardSlot }, out reason);

        public bool TryPassPriority(out string reason)
            => Send(new CommandDto { Kind = CommandKind.PassPriority }, out reason);

        public bool TryRespondQuickFromHand(CardInstance card, TargetSpec target, out string reason)
            => Send(new CommandDto { Kind = CommandKind.RespondQuickFromHand, CardInstanceId = card.InstanceId, Target = ToDto(target) }, out reason);

        public bool TryBeginAttack(CardInstance attacker, CardInstance defender, out string reason)
            => Send(new CommandDto { Kind = CommandKind.BeginAttackMonster, CardInstanceId = attacker.InstanceId, DefenderInstanceId = defender.InstanceId }, out reason);

        public bool TryBeginAttackFace(CardInstance attacker, out string reason)
            => Send(new CommandDto { Kind = CommandKind.BeginAttackFace, CardInstanceId = attacker.InstanceId }, out reason);

        private bool Send(CommandDto dto, out string reason)
        {
            if (netClient == null || !netClient.IsConnected)
            {
                reason = "Not connected to server.";
                return false;
            }
            netClient.Send(dto);
            reason = "";
            return true;
        }

        private static TargetDto ToDto(TargetSpec target)
        {
            var obj = target.Target;
            if (obj is CardInstance ci) return new TargetDto { Kind = TargetKind.Card, CardInstanceId = ci.InstanceId };
            if (obj is PlayerId pid) return new TargetDto { Kind = TargetKind.Player, Player = pid };
            return TargetDto.None();
        }
    }
}
