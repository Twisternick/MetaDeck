using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Events
{
    // ================================
    // Turn Flow
    // ================================

    public sealed class TurnStarted
    {
        public PlayerId ActivePlayer { get; }
        public int TurnNumber { get; }

        public TurnStarted(PlayerId activePlayer, int turnNumber)
        {
            ActivePlayer = activePlayer;
            TurnNumber = turnNumber;
        }
    }

    public sealed class TurnEnded
    {
        public PlayerId ActivePlayer { get; }
        public int TurnNumber { get; }

        public TurnEnded(PlayerId activePlayer, int turnNumber)
        {
            ActivePlayer = activePlayer;
            TurnNumber = turnNumber;
        }
    }

    // ================================
    // Chain Flow
    // ================================

    public sealed class ChainOpened
    {
        public PlayerId ActivePlayer { get; }

        public ChainOpened(PlayerId activePlayer)
        {
            ActivePlayer = activePlayer;
        }
    }

    public sealed class ChainItemAdded
    {
        public ChainItem Item { get; }
        public int NewDepth { get; }

        public ChainItemAdded(ChainItem item, int newDepth)
        {
            Item = item;
            NewDepth = newDepth;
        }
    }

    public sealed class ChainResolved
    {
        public int ItemsResolved { get; }

        public ChainResolved(int itemsResolved)
        {
            ItemsResolved = itemsResolved;
        }
    }

    // ================================
    // Card & Zone Movement
    // ================================

    public sealed class CardMoved
    {
        public CardInstance Card { get; }
        public Zone From { get; }
        public Zone To { get; }

        public CardMoved(CardInstance card, Zone from, Zone to)
        {
            Card = card;
            From = from;
            To = to;
        }
    }

    public sealed class CardEnteredGraveyard
    {
        public CardInstance Card { get; }
        public Zone From { get; }

        public CardEnteredGraveyard(CardInstance card, Zone from)
        {
            Card = card;
            From = from;
        }
    }

    public sealed class CardLeftGraveyard
    {
        public CardInstance Card { get; }
        public Zone To { get; }

        public CardLeftGraveyard(CardInstance card, Zone to)
        {
            Card = card;
            To = to;
        }
    }

    // ================================
    // Play Actions
    // ================================

    public sealed class CardPlayed
    {
        public CardInstance Card { get; }
        public Zone From { get; }

        public CardPlayed(CardInstance card, Zone from)
        {
            Card = card;
            From = from;
        }
    }

    public sealed class MonsterSummoned
    {
        public CardInstance Monster { get; }

        public MonsterSummoned(CardInstance monster)
        {
            Monster = monster;
        }
    }

    // ================================
    // Combat & Damage
    // ================================

    public sealed class AttackDeclared
    {
        public CardInstance Attacker { get; }
        public CardInstance Defender { get; }

        public AttackDeclared(CardInstance attacker, CardInstance defender)
        {
            Attacker = attacker;
            Defender = defender;
        }
    }

    /// <summary>
    /// Target is either CardInstance or PlayerId.
    /// </summary>
    public sealed class DamageDealt
    {
        public CardInstance Source { get; }
        public object Target { get; }
        public int Amount { get; }

        public DamageDealt(CardInstance source, object target, int amount)
        {
            Source = source;
            Target = target;
            Amount = amount;
        }
    }

    public sealed class MonsterDestroyed
    {
        public CardInstance Monster { get; }

        public MonsterDestroyed(CardInstance monster)
        {
            Monster = monster;
        }
    }

    public sealed class CardModifiersChanged
    {
        public CardInstance Card { get; }

        public CardModifiersChanged(CardInstance card)
        {
            Card = card;
        }
    }

    /// <summary>
    /// A player lost life directly (face attack, direct-damage spell, or fatigue).
    /// <see cref="Source"/> is null for sourceless damage such as fatigue.
    /// </summary>
    public sealed class PlayerDamaged
    {
        public CardInstance Source { get; }
        public PlayerId Player { get; }
        public int Amount { get; }

        public PlayerDamaged(CardInstance source, PlayerId player, int amount)
        {
            Source = source;
            Player = player;
            Amount = amount;
        }
    }

    /// <summary>The match has ended. <see cref="Winner"/> is null on a draw (both players defeated).</summary>
    public sealed class GameOver
    {
        public PlayerId? Winner { get; }
        public string Reason { get; }

        public GameOver(PlayerId? winner, string reason)
        {
            Winner = winner;
            Reason = reason;
        }
    }
}