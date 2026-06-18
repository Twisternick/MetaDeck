using UnityEngine;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    /// <summary>
    /// A drop target representing a player's "face" (the player themselves), used to declare a direct
    /// attack. Put this on a collider on the same layer as CardInput3D.zoneMask and place it over the
    /// opponent's portrait. You attack the OPPONENT's face, so by default this zone resolves its target
    /// dynamically to the local player's opponent — that way a single scene object is correct on both
    /// the P1 and P2 client. Untick <see cref="resolveOpponentAtRuntime"/> to pin it to an explicit
    /// <see cref="facePlayer"/> instead (e.g. local hot-seat with two fixed faces).
    /// The attack itself is submitted by CardInput3D; this zone only marks the target.
    /// </summary>
    public sealed class FaceDropZone3D : DropZone3D
    {
        [Tooltip("When true, this face is whoever the local player's opponent is (resolved from the net client).")]
        [SerializeField] private bool resolveOpponentAtRuntime = true;

        [Tooltip("Used only when 'resolveOpponentAtRuntime' is off: the fixed player this face belongs to.")]
        [SerializeField] private PlayerId facePlayer;

        [SerializeField] private MetaDeckNetClientMB netClient;

        /// <summary>The player this face currently represents (the one being attacked when you drop here).</summary>
        public PlayerId FacePlayer => ResolveFacePlayer();

        private void Awake()
        {
            if (netClient == null) netClient = FindFirstObjectByType<MetaDeckNetClientMB>();
        }

        private PlayerId ResolveFacePlayer()
        {
            if (resolveOpponentAtRuntime && netClient != null)
                return Opponent(netClient.LocalPlayer);
            return facePlayer;
        }

        // You can only attack a face that isn't your own card's owner — i.e. the opponent's.
        public override bool CanDrop(CardView3D card)
            => card != null && card.Instance != null && card.Instance.Owner != ResolveFacePlayer();

        // No-op: the attack is resolved by the engine via CardInput3D; nothing reparents here.
        public override void OnDrop(CardView3D card) { }

        private static PlayerId Opponent(PlayerId id) => id == PlayerId.P1 ? PlayerId.P2 : PlayerId.P1;
    }
}
