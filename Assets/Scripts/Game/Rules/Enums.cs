namespace MetaDeck.Rules
{
    public enum PlayerId { P1 = 0, P2 = 1 }

    public enum CardType { Monster, Spell, Trap }

    public enum Zone
    {
        Deck,
        Hand,
        Board,
        Graveyard,
        Void
    }

    public enum Keyword
    {
        None = 0,

        // Core
        Rush,
        FirstStrike,
        Guard,

        // FPS
        Stealth,        // untargetable until it attacks (rule)
        Suppression,    // “suppressed” marker (rule/effect)
        Headshot,       // “execute damaged” synergy marker (rule/effect)
        Drone,          // optional tribal tag
        Fear,
        Haunt,
        Devour,
        DoubleJump,
        Checkpoint,
        PoweredUp,
        XP,
        LevelUp,
        Equip,
        Momentum,
        Clutch,
        Structure,
        Generate,
        Fortify,
        District,
        Tax,
        Populate,
        Topdeck,
        Errata,
        Copy,
        // NOTE: append new keywords below this line ONLY. These are serialized by integer index in the
        // card .asset files; inserting mid-list silently remaps existing cards to the wrong keyword.
        Overtake        // Racing: gain Nitro on attacking & surviving
    }

    public enum SpeedWindow
    {
        None,
        Quick // playable in chain windows
    }

    public enum EffectType
    {
        // Existing (examples)
        Draw,
        DealDamage,
        Buff,
        Silence,
        DestroyDamaged,
        ReviveFromGraveyard,

        // NEW
        BuffAttackThisTurn,
        DebuffAttackThisCombat,
        GrantKeywordThisTurn,
        RemoveKeywordThisTurn,
        DealDamageAllEnemyMonsters,
        RevealOpponentHand,

        GainNitro,
        SpendNitroForBuff,
        GainXPCounter,
        Heal,
        BuffAllFriendlyMonsters,
        DiscardRandom,
        SummonToken,
        GainMaxBandwidthNextTurn,
        ReturnFromGraveyard,
        ReturnFromGraveyardToHand,
        ShuffleGraveyardIntoDeck,
        SwapBoardPositions,
        PreventCombatDamageThisCombat,
        // NOTE: append new effect types below this line ONLY. These are serialized by integer index in
        // the card .asset files; inserting mid-list silently remaps existing cards to the wrong effect.
        Generate,            // gain temporary Bandwidth this turn
        Equip                // permanently attach +X/+X and an optional keyword to a friendly monster
    }

    public enum SimpleTargeting
    {
        None,
        Self,
        EnemyMonster,
        FriendlyMonster,
        AnyMonster,
        EnemyPlayer,
        FriendlyPlayer,
        AnyPlayer,
        CardInYourGraveyard
    }
}