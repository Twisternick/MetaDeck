using MetaDeck.Core;

namespace MetaDeck.Engine.Mutations
{
    public interface IGameMutator
    {
        void AddModifier(CardInstance card, in MetaDeck.Rules.StatModifier mod);
        void RemoveModifiersByTag(CardInstance card, string tag);
    }
}