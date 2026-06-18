using MetaDeck.Rules;

namespace MetaDeck.Protocol
{
    // =====================================================================================
    // Wire DTOs shared by the Unity client and the .NET server. Deliberately FLAT and
    // attribute-free (a Kind enum instead of polymorphism) so they serialize cleanly with any
    // JSON library (Newtonsoft on both ends today). Cards are referenced by InstanceId; visual
    // data is looked up client-side by CardId. No Unity types here.
    // =====================================================================================

    // ---------- Commands (client -> server) ----------

    public enum CommandKind
    {
        PlayCard,
        SummonMonster,
        BeginAttackMonster,
        BeginAttackFace,
        PassPriority,
        RespondQuickFromHand,
        EndTurn,
        ActivateMonsterEffect
    }

    public enum TargetKind { None, Card, Player }

    public sealed class TargetDto
    {
        public TargetKind Kind { get; set; } = TargetKind.None;
        public string CardInstanceId { get; set; }   // when Kind == Card
        public PlayerId Player { get; set; }          // when Kind == Player

        public static TargetDto None() => new TargetDto { Kind = TargetKind.None };
    }

    /// <summary>One flat command envelope; only the fields relevant to <see cref="Kind"/> are used.</summary>
    public sealed class CommandDto
    {
        public CommandKind Kind { get; set; }

        public string CardInstanceId { get; set; }      // played/summoned card, attacker, effect source
        public Zone FromZone { get; set; }              // PlayCard / SummonMonster
        public TargetDto Target { get; set; }           // PlayCard / RespondQuick / ActivateMonsterEffect
        public bool AsChainItem { get; set; }           // PlayCard / ActivateMonsterEffect
        public int BoardSlot { get; set; }              // SummonMonster target slot
        public string DefenderInstanceId { get; set; }  // BeginAttackMonster
        public int EffectIndex { get; set; }            // ActivateMonsterEffect
    }

    // ---------- Events (server -> clients) ----------

    public enum EventKind
    {
        TurnStarted, TurnEnded,
        CardMoved, CardPlayed, MonsterSummoned,
        AttackDeclared, DamageDealt, PlayerDamaged, MonsterDestroyed,
        CardEnteredGraveyard, CardLeftGraveyard, CardModifiersChanged,
        ChainOpened, ChainItemAdded, ChainResolved,
        CardDrawn, CardsDrawn, CardDiscarded, CardsDiscarded,
        GameOver
    }

    /// <summary>One flat event envelope; only the fields relevant to <see cref="Kind"/> are populated.</summary>
    public sealed class EventDto
    {
        public EventKind Kind { get; set; }

        public string CardInstanceId { get; set; }      // primary/subject card or damage source
        public string TargetInstanceId { get; set; }    // DamageDealt against a card
        public PlayerId? TargetPlayer { get; set; }     // DamageDealt/PlayerDamaged against a player
        public Zone FromZone { get; set; }
        public Zone ToZone { get; set; }
        public PlayerId? Player { get; set; }            // turn/draw/discard/chain owner
        public int Amount { get; set; }                  // damage / draw / discard count
        public int TurnNumber { get; set; }
        public int Depth { get; set; }                   // chain depth
        public PlayerId? Winner { get; set; }            // GameOver (null = draw)
        public string Reason { get; set; }               // GameOver
    }

    // ---------- Snapshot (server -> a specific client, hidden-info filtered) ----------

    public sealed class CardDto
    {
        public string InstanceId { get; set; }
        public string CardId { get; set; }       // for client art/text lookup
        public PlayerId Owner { get; set; }
        public Zone Zone { get; set; }
        public CardType Type { get; set; }
        public int SlotIndex { get; set; } = -1;  // board slot, else -1
        public int Attack { get; set; }
        public int Health { get; set; }
        public int MaxHealth { get; set; }
        public int CurrentCost { get; set; }
        public Keyword[] Keywords { get; set; }
        public int SummonedTurn { get; set; } = -1;
    }

    public sealed class PlayerViewDto
    {
        public PlayerId Id { get; set; }
        public int Hp { get; set; }
        public int Bandwidth { get; set; }
        public int MaxBandwidth { get; set; }
        public int FatigueCounter { get; set; }

        public int DeckCount { get; set; }
        public int HandCount { get; set; }

        // Only the viewing player's own hand is populated; the opponent's stays empty (HandCount only).
        public System.Collections.Generic.List<CardDto> Hand { get; set; } = new System.Collections.Generic.List<CardDto>();
        public System.Collections.Generic.List<CardDto> Board { get; set; } = new System.Collections.Generic.List<CardDto>();
        public System.Collections.Generic.List<CardDto> Graveyard { get; set; } = new System.Collections.Generic.List<CardDto>();
    }

    /// <summary>A full game-state snapshot from one player's perspective (their hand visible, opponent's hidden).</summary>
    public sealed class SnapshotDto
    {
        public PlayerId Viewer { get; set; }
        public int TurnNumber { get; set; }
        public PlayerId ActivePlayer { get; set; }
        public bool IsOver { get; set; }
        public PlayerId? Winner { get; set; }
        public int ChainDepth { get; set; }
        public PlayerViewDto[] Players { get; set; }   // [P1 view, P2 view]
    }

    // ---------- Server -> client envelope ----------

    public enum ServerMessageKind { Welcome, Snapshot, Event, Error }

    /// <summary>Everything the server sends a client is wrapped in this; only the relevant field is set.</summary>
    public sealed class ServerMessage
    {
        public ServerMessageKind Kind { get; set; }
        public PlayerId AssignedPlayer { get; set; }   // Welcome: which side this client controls
        public SnapshotDto Snapshot { get; set; }      // Welcome / Snapshot
        public EventDto Event { get; set; }            // Event
        public string Error { get; set; }              // Error (e.g., rejected command)

        public static ServerMessage Welcome(PlayerId p, SnapshotDto s) => new ServerMessage { Kind = ServerMessageKind.Welcome, AssignedPlayer = p, Snapshot = s };
        public static ServerMessage OfSnapshot(SnapshotDto s) => new ServerMessage { Kind = ServerMessageKind.Snapshot, Snapshot = s };
        public static ServerMessage OfEvent(EventDto e) => new ServerMessage { Kind = ServerMessageKind.Event, Event = e };
        public static ServerMessage OfError(string msg) => new ServerMessage { Kind = ServerMessageKind.Error, Error = msg };
    }
}
