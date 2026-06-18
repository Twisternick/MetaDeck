namespace MetaDeck.Effects
{
    public interface IEffect
    {
        bool CanActivate(EffectContext ctx, out string reason);
        void Resolve(EffectContext ctx);
    }
}