using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    // Populate: summons `amount` (default 1) 1/1 Citizen tokens into the source owner's empty board
    // slots. Tokens are board-native (they belong to no zone list) and are placed directly. targeting
    // must be None. Excess tokens are dropped if the board is full.
    public sealed class SummonTokenEffect : IEffect
    {
        public const string TokenCardId = "token_citizen";

        private readonly int _amount;

        public SummonTokenEffect(int amount) => _amount = amount < 1 ? 1 : amount;

        public bool CanActivate(EffectContext ctx, out string reason)
        {
            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var owner = ctx.Source.Owner;
            int placed = 0;
            for (int slot = 0; slot < 5 && placed < _amount; slot++)
            {
                if (ctx.State.Board.GetAt(owner, slot) != null) continue;

                var token = new CardInstance(NewTokenId(), BuildTokenDef(), owner)
                {
                    Zone = Zone.Board,
                    SummonedTurn = ctx.State.TurnNumber // summoning sickness applies like a normal summon
                };
                ctx.State.Board.SetAt(owner, slot, token);
                ctx.Bus.Publish(new MonsterSummoned(token));
                placed++;
            }
        }

        private static string NewTokenId() => $"{TokenCardId}_{System.Guid.NewGuid():N}";

        private static CardDef BuildTokenDef() => new CardDef
        {
            cardId = TokenCardId,
            displayName = "Citizen",
            type = CardType.Monster,
            cost = 0,
            baseAttack = 1,
            baseHealth = 1,
            speedWindow = SpeedWindow.None,
            keywords = System.Array.Empty<Keyword>(),
            effects = System.Array.Empty<EffectDefinition>(),
            archetypes = new[] { "Token" }
        };
    }
}
