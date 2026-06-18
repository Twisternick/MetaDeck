using System;
using MetaDeck.Core;
using MetaDeck.Effects;
using MetaDeck.Engine;
using MetaDeck.Engine.Commands;
using MetaDeck.Events;

namespace MetaDeck.Protocol
{
    /// <summary>
    /// Server-side: rebuilds a real <see cref="IGameCommand"/> from a client <see cref="CommandDto"/>,
    /// resolving InstanceIds to live <see cref="CardInstance"/>s and injecting the match's services.
    /// The server validates ownership/turn separately before submitting. Pure (no Unity).
    /// </summary>
    public sealed class CommandFactory
    {
        private readonly Func<string, CardInstance> _resolve;
        private readonly ZoneService _zones;
        private readonly EffectRunner _effects;
        private readonly GameFlowStateMachine _flow;

        public CommandFactory(Func<string, CardInstance> resolve, ZoneService zones, EffectRunner effects, GameFlowStateMachine flow)
        {
            _resolve = resolve;
            _zones = zones;
            _effects = effects;
            _flow = flow;
        }

        public bool TryBuild(CommandDto dto, out IGameCommand command, out string error)
        {
            command = null;
            error = "";

            if (dto == null) { error = "Null command."; return false; }

            switch (dto.Kind)
            {
                case CommandKind.PlayCard:
                {
                    if (!TryResolve(dto.CardInstanceId, out var card, out error)) return false;
                    command = new PlayCardCommand(card, dto.FromZone, ToTargetSpec(dto.Target), dto.AsChainItem, _zones);
                    return true;
                }
                case CommandKind.SummonMonster:
                {
                    if (!TryResolve(dto.CardInstanceId, out var card, out error)) return false;
                    command = new SummonMonsterCommand(card, dto.FromZone, dto.BoardSlot, _zones, _effects, ToTargetSpec(dto.Target));
                    return true;
                }
                case CommandKind.BeginAttackMonster:
                {
                    if (!TryResolve(dto.CardInstanceId, out var attacker, out error)) return false;
                    if (!TryResolve(dto.DefenderInstanceId, out var defender, out error)) return false;
                    command = new BeginAttackCommand(_flow, attacker, defender);
                    return true;
                }
                case CommandKind.BeginAttackFace:
                {
                    if (!TryResolve(dto.CardInstanceId, out var attacker, out error)) return false;
                    command = new BeginAttackCommand(_flow, attacker);
                    return true;
                }
                case CommandKind.PassPriority:
                    command = new PassPriorityCommand(_flow);
                    return true;
                case CommandKind.RespondQuickFromHand:
                {
                    if (!TryResolve(dto.CardInstanceId, out var card, out error)) return false;
                    command = new RespondQuickFromHandCommand(_flow, card, ToTargetSpec(dto.Target));
                    return true;
                }
                case CommandKind.EndTurn:
                    command = new EndTurnCommand(_zones);
                    return true;
                case CommandKind.ActivateMonsterEffect:
                {
                    if (!TryResolve(dto.CardInstanceId, out var card, out error)) return false;
                    command = new ActivateMonsterEffectCommand(card, dto.EffectIndex, ToTargetSpec(dto.Target), dto.AsChainItem);
                    return true;
                }
                default:
                    error = $"Unknown command kind {dto.Kind}.";
                    return false;
            }
        }

        private bool TryResolve(string id, out CardInstance card, out string error)
        {
            error = "";
            card = string.IsNullOrEmpty(id) ? null : _resolve(id);
            if (card == null) { error = $"Unknown card instance '{id}'."; return false; }
            return true;
        }

        private TargetSpec ToTargetSpec(TargetDto t)
        {
            if (t == null || t.Kind == TargetKind.None) return TargetSpec.None();
            if (t.Kind == TargetKind.Player) return new TargetSpec(t.Player);
            var c = string.IsNullOrEmpty(t.CardInstanceId) ? null : _resolve(t.CardInstanceId);
            return new TargetSpec(c);
        }
    }
}
