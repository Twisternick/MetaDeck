using MetaDeck.Core;
using MetaDeck.Engine;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    // Revive target monster from your graveyard into an empty slot.
    // Drawback: revived enters with -1/-1 (anti-degeneracy).
    public sealed class ReviveFromGraveyardEffect : IEffect
    {
        public bool CanActivate(EffectContext ctx, out string reason)
        {
            if (ctx.Target.Target is not CardInstance card)
            {
                reason = "No target.";
                return false;
            }

            if (card.Owner != ctx.Source.Owner)
            {
                reason = "Can only revive your own cards.";
                return false;
            }

            if (card.Zone != Zone.Graveyard || card.Def.type != CardType.Monster)
            {
                reason = "Target must be a monster in your graveyard.";
                return false;
            }

            // Need a free board slot
            bool hasFree = false;
            for (int i = 0; i < 5; i++)
                if (ctx.State.Board.GetAt(card.Owner, i) == null) { hasFree = true; break; }

            if (!hasFree)
            {
                reason = "No free board slot.";
                return false;
            }

            reason = "";
            return true;
        }

        public void Resolve(EffectContext ctx)
        {
            var zones = new ZoneService();
            var card = (CardInstance)ctx.Target.Target!;

            // Find first free slot
            int slot = -1;
            for (int i = 0; i < 5; i++)
                if (ctx.State.Board.GetAt(card.Owner, i) == null) { slot = i; break; }

            zones.SummonMonsterToSlot(ctx.State, card, Zone.Graveyard, slot, ctx.Bus);

            // Revive drawback
            card.Attack = System.Math.Max(0, card.Attack - 1);
            card.Health = System.Math.Max(1, card.Health - 1);
        }
    }
}