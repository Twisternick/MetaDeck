using System.Collections.Generic;
using UnityEngine;
using MetaDeck.Core;
using MetaDeck.Rules;

public sealed class UISelectionController : MonoBehaviour
{
    public enum Intent
    {
        None,
        SummonChooseSlot,
        SpellChooseTarget,
        AttackChooseAttacker,
        AttackChooseDefender,
        ChainResponseChooseCard,
        ChainResponseChooseTarget
    }

    public Intent CurrentIntent { get; private set; }

    public CardInstance SelectedCard { get; private set; }
    public int SelectedHandIndex { get; private set; } = -1;
    public int SelectedBoardSlot { get; private set; } = -1;

    public void Clear()
    {
        CurrentIntent = Intent.None;
        SelectedCard = null;
        SelectedHandIndex = -1;
        SelectedBoardSlot = -1;
    }

    public void StartSummon(CardInstance card, int handIndex)
    {
        Clear();
        CurrentIntent = Intent.SummonChooseSlot;
        SelectedCard = card;
        SelectedHandIndex = handIndex;
    }

    public void StartSpell(CardInstance card, int handIndex)
    {
        Clear();
        CurrentIntent = Intent.SpellChooseTarget;
        SelectedCard = card;
        SelectedHandIndex = handIndex;
    }

    public void StartAttackPickAttacker()
    {
        Clear();
        CurrentIntent = Intent.AttackChooseAttacker;
    }

    public void PickAttacker(CardInstance attacker, int slotIndex)
    {
        SelectedCard = attacker;
        SelectedBoardSlot = slotIndex;
        CurrentIntent = Intent.AttackChooseDefender;
    }

    public void SetIntent(Intent intent)
    {
        CurrentIntent = intent;
    }
}