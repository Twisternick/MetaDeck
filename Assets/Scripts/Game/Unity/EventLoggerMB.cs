using UnityEngine;

using MetaDeck.Events;

namespace MetaDeck.Unity
{
    public sealed class EventLoggerMB : MonoBehaviour
    {
        [SerializeField] private GameHostMB game;
        [SerializeField] private bool verbose = true;

        private void Awake()
        {
            if (game == null) game = FindFirstObjectByType<GameHostMB>();
        }

        private void OnEnable()
        {
            if (game?.Bus == null) return;

            game.Bus.Subscribe<TurnStarted>(e => { if (verbose) Debug.Log($"TurnStarted: {e.ActivePlayer} Turn {e.TurnNumber}"); });
            game.Bus.Subscribe<TurnEnded>(e => { if (verbose) Debug.Log($"TurnEnded: {e.ActivePlayer} Turn {e.TurnNumber}"); });

            game.Bus.Subscribe<CardMoved>(e => { if (verbose) Debug.Log($"CardMoved: {e.Card.Def.displayName} {e.From} -> {e.To}"); });
            game.Bus.Subscribe<CardPlayed>(e => { if (verbose) Debug.Log($"CardPlayed: {e.Card.Def.displayName} from {e.From}"); });
            game.Bus.Subscribe<MonsterSummoned>(e => { if (verbose) Debug.Log($"MonsterSummoned: {e.Monster.Def.displayName}"); });

            game.Bus.Subscribe<AttackDeclared>(e => { if (verbose) Debug.Log($"AttackDeclared: {e.Attacker.Def.displayName} -> {e.Defender.Def.displayName}"); });
            game.Bus.Subscribe<DamageDealt>(e =>
            {
                if (!verbose) return;
                var tgt = e.Target is MetaDeck.Core.CardInstance ci ? ci.Def.displayName : e.Target?.ToString();
                Debug.Log($"DamageDealt: {e.Source.Def.displayName} dealt {e.Amount} to {tgt}");
            });

            game.Bus.Subscribe<MonsterDestroyed>(e => { if (verbose) Debug.Log($"MonsterDestroyed: {e.Monster.Def.displayName}"); });

            game.Bus.Subscribe<PlayerDamaged>(e =>
            {
                if (!verbose) return;
                var who = e.Source != null ? e.Source.Def.displayName : "Fatigue";
                Debug.Log($"PlayerDamaged: {e.Player} took {e.Amount} from {who}");
            });
            game.Bus.Subscribe<GameOver>(e => Debug.Log($"GameOver: {e.Reason}"));

            game.Bus.Subscribe<CardEnteredGraveyard>(e => { if (verbose) Debug.Log($"CardEnteredGraveyard: {e.Card.Def.displayName} from {e.From}"); });
            game.Bus.Subscribe<CardLeftGraveyard>(e => { if (verbose) Debug.Log($"CardLeftGraveyard: {e.Card.Def.displayName} to {e.To}"); });

            game.Bus.Subscribe<ChainOpened>(e => { if (verbose) Debug.Log($"ChainOpened for active player: {e.ActivePlayer}"); });
            game.Bus.Subscribe<ChainItemAdded>(e => { if (verbose) Debug.Log($"ChainItemAdded: {e.Item.Source.Def.displayName} depth={e.NewDepth}"); });
            game.Bus.Subscribe<ChainResolved>(e => { if (verbose) Debug.Log($"ChainResolved: items={e.ItemsResolved}"); });
        }

        private void OnDisable()
        {
            if (game?.Bus == null) return;

            game.Bus.Unsubscribe<TurnStarted>(e => { if (verbose) Debug.Log($"TurnStarted: {e.ActivePlayer} Turn {e.TurnNumber}"); });
            game.Bus.Unsubscribe<TurnEnded>(e => { if (verbose) Debug.Log($"TurnEnded: {e.ActivePlayer} Turn {e.TurnNumber}"); });

            game.Bus.Unsubscribe<CardMoved>(e => { if (verbose) Debug.Log($"CardMoved: {e.Card.Def.displayName} {e.From} -> {e.To}"); });
            game.Bus.Unsubscribe<CardPlayed>(e => { if (verbose) Debug.Log($"CardPlayed: {e.Card.Def.displayName} from {e.From}"); });
            game.Bus.Unsubscribe<MonsterSummoned>(e => { if (verbose) Debug.Log($"MonsterSummoned: {e.Monster.Def.displayName}"); });

            game.Bus.Unsubscribe<AttackDeclared>(e => { if (verbose) Debug.Log($"AttackDeclared: {e.Attacker.Def.displayName} -> {e.Defender.Def.displayName}"); });
            game.Bus.Unsubscribe<DamageDealt>(e =>
            {
                if (!verbose) return;
                var tgt = e.Target is MetaDeck.Core.CardInstance ci ? ci.Def.displayName : e.Target?.ToString();
                Debug.Log($"DamageDealt: {e.Source.Def.displayName} dealt {e.Amount} to {tgt}");
            });

            game.Bus.Unsubscribe<MonsterDestroyed>(e => { if (verbose) Debug.Log($"MonsterDestroyed: {e.Monster.Def.displayName}"); });

            game.Bus.Unsubscribe<CardEnteredGraveyard>(e => { if (verbose) Debug.Log($"CardEnteredGraveyard: {e.Card.Def.displayName} from {e.From}"); });
            game.Bus.Unsubscribe<CardLeftGraveyard>(e => { if (verbose) Debug.Log($"CardLeftGraveyard: {e.Card.Def.displayName} to {e.To}"); });

            game.Bus.Unsubscribe<ChainOpened>(e => { if (verbose) Debug.Log($"ChainOpened for active player: {e.ActivePlayer}"); });
            game.Bus.Unsubscribe<ChainItemAdded>(e => { if (verbose) Debug.Log($"ChainItemAdded: {e.Item.Source.Def.displayName} depth={e.NewDepth}"); });
            game.Bus.Unsubscribe<ChainResolved>(e => { if (verbose) Debug.Log($"ChainResolved: items={e.ItemsResolved}"); });
        }
    }
}