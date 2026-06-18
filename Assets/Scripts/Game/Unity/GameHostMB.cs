using System.Collections.Generic;
using UnityEngine;

using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Engine;
using MetaDeck.Events;

namespace MetaDeck.Unity
{
    /// <summary>
    /// Canonical match host and the single source of truth for the live game.
    /// Bootstrap flow:
    ///   Awake
    ///     -> MatchBootstrapper.BuildNewGame(...)        builds players, decks, shuffles, opening hands
    ///        -> KeywordRoutingEventBus wraps a raw EventBus  (publish -> subscribers, then keyword reactions)
    ///        -> new GameEngine(state, wrappedBus)
    ///     -> new GameFlowStateMachine(Engine, Bus)      (must come AFTER Engine + Bus exist)
    /// UI (GameUIBinderMB) and input (GameCommandFacadeMB) resolve this host and read Engine/State/Bus/Flow.
    /// </summary>
    public sealed class GameHostMB : MonoBehaviour
    {
        [Header("Deck Lists (ScriptableObjects)")]
        public List<CardDefinition> player1Deck = new();
        public List<CardDefinition> player2Deck = new();

        [Header("Match Settings")]
        public int startingHp = 30;
        public int openingHandSize = 3;

        public int startingBandwidth = 1;

        [Tooltip("If true, logs all events to the Console (you can also use EventLoggerMB).")]
        public bool verboseEventLogging = true;

        public GameEngine Engine { get; private set; }
        public GameState State => Engine != null ? Engine.State : null;
        public IEventBus Bus { get; private set; }

        public GameFlowStateMachine Flow { get; private set; }

        // Card instance lookup
        public IReadOnlyDictionary<string, CardInstance> InstanceIndex => _instanceIndex;
        private Dictionary<string, CardInstance> _instanceIndex;

        private System.Random _rng;

        private void Awake()
        {
            // Route engine logging to the Unity console before anything runs (bootstrap publishes events).
            MetaDeck.Diagnostics.GameLog.Logger = new UnityGameLogger();
            MetaDeck.Diagnostics.GameLog.Verbose = verboseEventLogging;

            _rng = new System.Random();
            StartNewGame();
        }

        public void StartNewGame()
        {
            var bootstrapper = new MatchBootstrapper(_rng);
            var result = bootstrapper.BuildNewGame(player1Deck, player2Deck, startingHp, openingHandSize, startingBandwidth);

            // result contains the "real" bus and engine built by the bootstrapper
            Bus = result.Bus;
            Engine = result.Engine;
            _instanceIndex = result.InstanceIndex;

            // IMPORTANT: Flow (state machine) must be built AFTER Engine and Bus exist
            Flow = new GameFlowStateMachine(Engine, Bus);

            if (verboseEventLogging)
            {
                Debug.Log("New game started.");
            }
        }

        public CardInstance ResolveInstanceById(string id)
        {
            if (id == null) return null;
            return _instanceIndex != null && _instanceIndex.TryGetValue(id, out var c) ? c : null;
        }
    }
}