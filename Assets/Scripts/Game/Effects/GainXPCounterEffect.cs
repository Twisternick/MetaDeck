using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    // Adds N XP counters to a target monster. Tracked in CardInstance.Counters["XP"].
    // Use FriendlyHasXPCounter condition on other effects to reward XP investment.
    public sealed class GainXPCounterEffect : IEffect
    {
        private readonly int _amount;
        public GainXPCounterEffect(int amount) => _amount = amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            if (ctx.Target.Target is not CardInstance ci || ci.Def.type != CardType.Monster)
            {
                reason = "Target must be a monster.";
                return false;
            }
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var monster = (CardInstance)ctx.Target.Target!;
            monster.Counters.TryGetValue("XP", out int current);
            monster.Counters["XP"] = current + _amount;
        }
    }
}
