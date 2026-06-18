using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Protocol
{
    /// <summary>
    /// Server-side: maps an engine event object into a flat <see cref="EventDto"/> for the wire
    /// (CardInstance references become InstanceIds). Returns null for events not carried over the
    /// network. Pure (no Unity).
    /// </summary>
    public static class EventMapper
    {
        public static EventDto Map(object e)
        {
            switch (e)
            {
                case TurnStarted x:
                    return new EventDto { Kind = EventKind.TurnStarted, Player = x.ActivePlayer, TurnNumber = x.TurnNumber };
                case TurnEnded x:
                    return new EventDto { Kind = EventKind.TurnEnded, Player = x.ActivePlayer, TurnNumber = x.TurnNumber };

                case CardMoved x:
                    return new EventDto { Kind = EventKind.CardMoved, CardInstanceId = x.Card.InstanceId, FromZone = x.From, ToZone = x.To };
                case CardPlayed x:
                    return new EventDto { Kind = EventKind.CardPlayed, CardInstanceId = x.Card.InstanceId, FromZone = x.From };
                case MonsterSummoned x:
                    return new EventDto { Kind = EventKind.MonsterSummoned, CardInstanceId = x.Monster.InstanceId };

                case AttackDeclared x:
                    return new EventDto { Kind = EventKind.AttackDeclared, CardInstanceId = x.Attacker.InstanceId, TargetInstanceId = x.Defender?.InstanceId };
                case DamageDealt x:
                {
                    var dto = new EventDto { Kind = EventKind.DamageDealt, CardInstanceId = x.Source?.InstanceId, Amount = x.Amount };
                    if (x.Target is CardInstance ci) dto.TargetInstanceId = ci.InstanceId;
                    else if (x.Target is PlayerId pl) dto.TargetPlayer = pl;
                    return dto;
                }
                case PlayerDamaged x:
                    return new EventDto { Kind = EventKind.PlayerDamaged, CardInstanceId = x.Source?.InstanceId, TargetPlayer = x.Player, Amount = x.Amount };
                case MonsterDestroyed x:
                    return new EventDto { Kind = EventKind.MonsterDestroyed, CardInstanceId = x.Monster.InstanceId };

                case CardEnteredGraveyard x:
                    return new EventDto { Kind = EventKind.CardEnteredGraveyard, CardInstanceId = x.Card.InstanceId, FromZone = x.From };
                case CardLeftGraveyard x:
                    return new EventDto { Kind = EventKind.CardLeftGraveyard, CardInstanceId = x.Card.InstanceId, ToZone = x.To };
                case CardModifiersChanged x:
                    return new EventDto { Kind = EventKind.CardModifiersChanged, CardInstanceId = x.Card.InstanceId };

                case ChainOpened x:
                    return new EventDto { Kind = EventKind.ChainOpened, Player = x.ActivePlayer };
                case ChainItemAdded x:
                    return new EventDto { Kind = EventKind.ChainItemAdded, CardInstanceId = x.Item?.Source?.InstanceId, Depth = x.NewDepth };
                case ChainResolved x:
                    return new EventDto { Kind = EventKind.ChainResolved, Amount = x.ItemsResolved };

                case CardDrawn x:
                    return new EventDto { Kind = EventKind.CardDrawn, Player = x.Player, CardInstanceId = x.Card.InstanceId };
                case CardsDrawn x:
                    return new EventDto { Kind = EventKind.CardsDrawn, Player = x.Player, Amount = x.Count };
                case CardDiscarded x:
                    return new EventDto { Kind = EventKind.CardDiscarded, CardInstanceId = x.Card.InstanceId, FromZone = x.FromZone, Player = x.Player };
                case CardsDiscarded x:
                    return new EventDto { Kind = EventKind.CardsDiscarded, Player = x.Player, Amount = x.Count };

                case GameOver x:
                    return new EventDto { Kind = EventKind.GameOver, Winner = x.Winner, Reason = x.Reason };

                default:
                    return null; // not carried over the wire
            }
        }
    }
}
