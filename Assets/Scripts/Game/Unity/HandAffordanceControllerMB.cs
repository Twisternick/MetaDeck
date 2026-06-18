using System.Collections;
using UnityEngine;

using MetaDeck.Core;
using MetaDeck.Events;
using MetaDeck.Rules;

namespace MetaDeck.Unity
{
    public sealed class HandAffordanceControllerMB : MonoBehaviour
    {
        [SerializeField] private GameHostMB game;
        [SerializeField] private PlayerId playerId = PlayerId.P1;

        [Tooltip("Transform that contains CardView3D children for this player's hand.")]
        [SerializeField] private Transform handContainer;

        private PlayerState _player;
        private bool _bound;

        private void Awake()
        {
            if (game == null) game = FindFirstObjectByType<GameHostMB>();
            if (handContainer == null) handContainer = transform;
        }

        private void OnEnable()
        {
            StartCoroutine(BindWhenReady());
        }

        private void OnDisable()
        {
            Unbind();
        }

        private IEnumerator BindWhenReady()
        {
            // Wait until game + state exist (covers script execution order issues)
            while (game == null || game.State == null || game.Bus == null)
                yield return null;

            TryBind();

            // One extra sync next frame helps if hand views spawn during the same frame as bind
            yield return null;
            ForceSync();
        }

        private void TryBind()
        {
            if (_bound) return;
            if (game == null || game.State == null || game.Bus == null) return;

            _player = game.State.GetPlayer(playerId);
            if (_player == null) return;

            // --- Subscribe: bandwidth changes ---
            // If your PlayerState event is Action<int,int> (current,max), use the 2-param handler.
            // If it's Action<int> (current only), use the 1-param handler.
            // You can't subscribe to both unless both exist, so choose the one that matches your PlayerState.
            // Pick ONE of these blocks based on your PlayerState definition:

            // A) If PlayerState has: event Action<int,int> OnBandwidthChanged;
            // _player.OnBandwidthChanged += OnBandwidthChanged2;

            // B) If PlayerState has: event Action<int> OnBandwidthChanged;
            _player.OnBandwidthChanged += OnBandwidthChanged1;

            // --- Subscribe: cards moving zones (draw/play/discard) ---
            game.Bus.Subscribe<CardMoved>(OnCardMoved);

            _bound = true;

            ForceSync();
        }

        private void Unbind()
        {
            if (!_bound) return;

            if (_player != null)
            {
                // Match whichever subscribe block you used above

                // A) _player.OnBandwidthChanged -= OnBandwidthChanged2;
                _player.OnBandwidthChanged -= OnBandwidthChanged1;

                _player = null;
            }

            // If your bus supports Unsubscribe, do it here.
            // If it doesn't, keep this controller alive for the whole match and don't disable it.
            // game.Bus.Unsubscribe<CardMoved>(OnCardMoved);

            _bound = false;
        }

        // ----- Bandwidth handlers (choose signature that matches your PlayerState event) -----

        // For Action<int>:
        private void OnBandwidthChanged1(int current)
        {
            Sync(current);
        }

        // For Action<int,int>:
        private void OnBandwidthChanged2(int current, int max)
        {
            Sync(current);
        }

        // ----- CardMoved handler -----

        private void OnCardMoved(CardMoved e)
        {
            // Only care about moves that affect THIS player's hand.
            // When a card enters or leaves hand, affordances may need updating (new card appears, etc).
            if (e.Card.Owner != playerId) return;

            if (e.From == Zone.Hand || e.To == Zone.Hand)
            {
                ForceSync();
            }
        }

        private void ForceSync()
        {
            if (_player == null) return;
            Sync(_player.Bandwidth);
        }

        private void Sync(int currentBandwidth)
        {
            UnityEngine.Debug.Log($"HandAffordanceControllerMB: Syncing hand affordances for player {playerId}, current bandwidth: {currentBandwidth}");
            foreach (Transform child in handContainer)
            {
                var cv = child.GetComponentInChildren<CardView3D>();
                if (cv == null) continue;

                // Prefer current cost if you have it (cost modifiers, discounts, etc.)
                // If CardView3D exposes Instance:
                var cost = cv.Instance != null ? cv.Instance.CurrentCost : 0;

                cv.SetAffordable(currentBandwidth >= cost);
            }
        }
    }
}