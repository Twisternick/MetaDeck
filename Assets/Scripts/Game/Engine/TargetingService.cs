using System.Linq;
using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Effects
{
    public sealed class TargetingService
    {
        public bool TryBuildTarget(GameState state, CardInstance source, SimpleTargeting targeting, out TargetSpec target, out string reason)
        {
            reason = null;

            switch (targeting)
            {
                case SimpleTargeting.None:
                    target = TargetSpec.None();
                    return true;

                case SimpleTargeting.Self:
                    target = new TargetSpec(source);
                    return true;

                case SimpleTargeting.EnemyPlayer:
                    target = new TargetSpec(state.OpponentOf(source.Owner));
                    return true;

                case SimpleTargeting.FriendlyPlayer:
                    target = new TargetSpec(source.Owner);
                    return true;

                case SimpleTargeting.CardInYourGraveyard:
                    {
                        var gy = state.GetPlayer(source.Owner).Graveyard;
                        var card = gy.Cards.FirstOrDefault();
                        if (card == null)
                        {
                            target = TargetSpec.None();
                            reason = "No cards in your graveyard.";
                            return false;
                        }

                        target = new TargetSpec(card);
                        return true;
                    }

                default:
                    target = TargetSpec.None();
                    reason = $"Targeting '{targeting}' not supported yet.";
                    return false;
            }
        }
    }
}