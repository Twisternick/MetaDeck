namespace MetaDeck.Engine
{
    public enum GamePhase
    {
        Main,               // normal play
        ChainResponse,      // players can add chain items or pass
        ResolvingChain,     // resolving stack LIFO
        Cleanup,             // death cleanup, end-of-action housekeeping
        Targeting
    }
}