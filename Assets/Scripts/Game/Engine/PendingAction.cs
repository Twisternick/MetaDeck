using MetaDeck.Core;
using MetaDeck.Effects;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine
{
    public enum PendingActionType
    {
        None,
        Attack,
        KeywordTrigger,
        EffectTrigger
        // Add more later: SpellPlay, Summon, StartTurnTrigger, EndTurnTrigger, etc.
    }

    public sealed class PendingAction
    {
        public string id { get; private set; } // for tracking/analytics, e.g. "Attack_P1Card123_P2Card456"
        public PendingActionType Type { get; private set; }

        public PlayerId Controller { get; private set; } // who controls this action (for keyword/effect triggers)

        // Attack payload
        public CardInstance Attacker { get; private set; }
        public CardInstance Defender { get; private set; }       // null when attacking face
        public PlayerId? DefenderPlayer { get; private set; }     // set when attacking a player directly

        public CardInstance Source { get; private set; } // for keyword/effect triggers
        public IEffect Effect { get; private set; } // for effect triggers
        public SimpleTargeting Targeting { get; private set; } // for keyword/effect triggers
        public TargetSpec Target { get; set; } // assigned when player selects target

        private PendingAction() { }

        public static PendingAction None()
        {
            return new PendingAction { Type = PendingActionType.None };
        }

        public static PendingAction Attack(CardInstance attacker, CardInstance defender)
        {
            return new PendingAction
            {
                Type = PendingActionType.Attack,
                Attacker = attacker,
                Defender = defender
            };
        }

        public static PendingAction AttackFace(CardInstance attacker, PlayerId defenderPlayer)
        {
            return new PendingAction
            {
                Type = PendingActionType.Attack,
                Attacker = attacker,
                Defender = null,
                DefenderPlayer = defenderPlayer
            };
        }

        public static PendingAction EffectTrigger(CardInstance source, IEffect effect, SimpleTargeting targeting)
        {
            return new PendingAction
            {
                Type = PendingActionType.EffectTrigger,
                Source = source,
                Effect = effect,
                Targeting = targeting,
                Controller = source.Owner
            };
        }
    }
}