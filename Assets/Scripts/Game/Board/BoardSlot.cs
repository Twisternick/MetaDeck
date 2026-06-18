using System;
using UnityEngine;

namespace MetaDeck.Unity
{
    public sealed class BoardSlot : MonoBehaviour
    {
        [Header("Identity")]
        [SerializeField] private int slotIndex;
        [SerializeField] private bool isPlayerSide;

        public int SlotIndex { get { return slotIndex; } set { slotIndex = value; } }
        public bool IsPlayerSide { get { return isPlayerSide; } set { isPlayerSide = value; } }

        public event Action<BoardSlot> Clicked;

        public void RaiseClicked() => Clicked?.Invoke(this);

        public void Init(int slotIndex, bool isPlayerSide)
        {
            this.slotIndex = slotIndex;
            this.isPlayerSide = isPlayerSide;
        }
    }
}