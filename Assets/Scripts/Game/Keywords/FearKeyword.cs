using MetaDeck.Core;
using MetaDeck.Engine.Mutations;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.Rules.Keywords.Hooks;

namespace MetaDeck.Rules.Keywords.Handlers
{
    /// <summary>
    /// Fear — when this monster attacks an enemy monster, that defender gets -1 Attack until end of
    /// turn (applied on AttackDeclared, before combat damage is dealt). The temporary modifier is
    /// cleared by EndTurnCommand's end-of-turn cleanup.
    /// </summary>
    public sealed class FearKeywordHandler : IKeywordEventHook<AttackDeclared>
    {
        public Keyword Keyword => Keyword.Fear;

        public void OnEvent(GameState state, CardInstance host, in AttackDeclared e, IGameMutator mutator)
        {
            if (e.Attacker != host || e.Defender == null) return;
            mutator.AddModifier(e.Defender, new StatModifier("Fear", -1, 0, ModifierDuration.UntilEndOfTurn, host.InstanceId));
        }
    }
}
