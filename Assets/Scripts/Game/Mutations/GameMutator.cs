using System;
using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Engine.Mutations
{
    /// <summary>
    /// Minimal mutator that edits CardInstance.Modifiers and optionally publishes an event.
    /// Extend later with turn/combat cleanup, zone checks, etc.
    /// </summary>
    public sealed class GameMutator : IGameMutator
    {
        private readonly IEventBus _bus;

        public GameMutator(IEventBus bus)
        {
            _bus = bus;
        }

        public void AddModifier(CardInstance card, in StatModifier mod)
        {
            card.StatModifiers.Add(mod);
            _bus?.Publish(new CardModifiersChanged(card));
        }

        public void RemoveModifiersByTag(CardInstance card, string tag)
        {
            card.StatModifiers.RemoveAll(m => string.Equals(m.Tag, tag, StringComparison.Ordinal));
            _bus?.Publish(new CardModifiersChanged(card));
        }
    }
}