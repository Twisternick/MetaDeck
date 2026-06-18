using UnityEngine;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    /// <summary>
    /// A drop target representing a player's "face" (the player themselves), used to declare a
    /// direct attack. Put this on a collider on the same layer as CardInput3D.zoneMask, and set
    /// <see cref="facePlayer"/> to the player this face belongs to (you attack the OPPONENT's face).
    /// The attack itself is submitted by CardInput3D; this zone only marks the target.
    /// </summary>
    public sealed class FaceDropZone3D : DropZone3D
    {
        [SerializeField] private PlayerId facePlayer;
        public PlayerId FacePlayer => facePlayer;

        public override bool CanDrop(CardView3D card)
            => card != null && card.Instance != null && card.Instance.Owner != facePlayer;

        // No-op: the attack is resolved by the engine via CardInput3D; nothing reparents here.
        public override void OnDrop(CardView3D card) { }
    }
}
