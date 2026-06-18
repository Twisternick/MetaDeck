using MetaDeck.Core;
using MetaDeck.Rules;
using MetaDeck.UI;
using MetaDeck.Unity;

/// <summary>
/// Drives board-slot highlights from the current UI selection intent, using
/// RulesQueryService to compute legal slots/targets. Visual-only.
/// </summary>
public sealed class HighlightController
{
    private readonly BoardSlotViewMB[] _playerSlots;
    private readonly BoardSlotViewMB[] _enemySlots;
    private readonly RulesQueryService _rules;
    private readonly UISelectionController _selection;

    public HighlightController(
        BoardSlotViewMB[] playerSlots,
        BoardSlotViewMB[] enemySlots,
        RulesQueryService rules,
        UISelectionController selection)
    {
        _playerSlots = playerSlots;
        _enemySlots = enemySlots;
        _rules = rules;
        _selection = selection;
    }

    public void UpdateHighlights(GameState state)
    {
        for (int i = 0; i < _playerSlots.Length; i++)
        {
            _playerSlots[i].SetHighlight(false);
            _enemySlots[i].SetHighlight(false);
        }

        if (_selection == null) return;

        var ap = state.ActivePlayer;

        switch (_selection.CurrentIntent)
        {
            case UISelectionController.Intent.SummonChooseSlot:
            {
                var hand = state.GetPlayer(ap).Hand.Cards;
                if (_selection.SelectedHandIndex >= 0 && _selection.SelectedHandIndex < hand.Count)
                {
                    var monster = hand[_selection.SelectedHandIndex];
                    var slots = _rules.GetValidSummonSlots(state, ap, monster);
                    for (int i = 0; i < slots.Count; i++)
                        _playerSlots[slots[i]].SetHighlight(true);
                }
                break;
            }
            case UISelectionController.Intent.AttackChooseAttacker:
            {
                var attackers = _rules.GetValidAttackers(state, ap);
                for (int i = 0; i < attackers.Count; i++)
                    _playerSlots[attackers[i]].SetHighlight(true);
                break;
            }
            case UISelectionController.Intent.AttackChooseDefender:
            {
                var attacker = state.Board.GetAt(ap, _selection.SelectedBoardSlot);
                var defenders = _rules.GetValidDefenders(state, ap, attacker);
                for (int i = 0; i < defenders.Count; i++)
                    _enemySlots[defenders[i]].SetHighlight(true);
                break;
            }
            case UISelectionController.Intent.SpellChooseTarget:
            case UISelectionController.Intent.ChainResponseChooseTarget:
            {
                for (int i = 0; i < _enemySlots.Length; i++)
                    _enemySlots[i].SetHighlight(true);
                break;
            }
        }
    }
}
