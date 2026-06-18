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
        Overtake,       // Racing: gain Nitro on attacking & surviving
        Topdeck,
        Errata,
        Copy
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
        Generate,            // gain temporary Bandwidth this turn
        SpendNitroForBuff,
        GainXPCounter,
        Equip,               // permanently attach +X/+X and an optional keyword to a friendly monster
        Heal,
        BuffAllFriendlyMonsters,
        DiscardRandom,
        SummonToken,
        GainMaxBandwidthNextTurn,
        ReturnFromGraveyard,
        ReturnFromGraveyardToHand,
        ShuffleGraveyardIntoDeck,
        SwapBoardPositions,
        PreventCombatDamageThisCombat
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