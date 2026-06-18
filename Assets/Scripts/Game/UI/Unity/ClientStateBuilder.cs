using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Protocol;
using MetaDeck.Rules;

namespace MetaDeck.Presentation
{
    /// <summary>
    /// Rebuilds a <see cref="GameState"/> from a server <see cref="SnapshotDto"/> so the existing
    /// renderers (which consume GameState/CardInstance) work unchanged against networked data.
    /// CardInstance objects are cached by InstanceId and updated in place, so view identity in
    /// ViewRegistry stays stable across snapshots. Static card data (name/art/effects/base stats)
    /// comes from <see cref="CardLibrary"/> by cardId.
    /// </summary>
    public sealed class ClientStateBuilder
    {
        private readonly Dictionary<string, CardInstance> _cache = new();
        private readonly HashSet<string> _warnedMissing = new();

        public GameState Build(SnapshotDto snap)
        {
            var p1View = snap.Players[0];
            var p2View = snap.Players[1];

            var p1 = new PlayerState(PlayerId.P1, p1View.Hp);
            var p2 = new PlayerState(PlayerId.P2, p2View.Hp);
            ApplyMeta(p1, p1View);
            ApplyMeta(p2, p2View);

            var state = new GameState(p1, p2)
            {
                ActivePlayer = snap.ActivePlayer,
                TurnNumber = snap.TurnNumber,
                IsOver = snap.IsOver,
                Winner = snap.Winner
            };

            BuildZones(state, p1View);
            BuildZones(state, p2View);
            return state;
        }

        private static void ApplyMeta(PlayerState p, PlayerViewDto v)
        {
            p.Bandwidth = v.Bandwidth;
            p.MaxBandwidth = v.MaxBandwidth;
            p.FatigueCounter = v.FatigueCounter;
        }

        private void BuildZones(GameState state, PlayerViewDto v)
        {
            var p = state.GetPlayer(v.Id);

            // Own hand (opponent's hand is hidden in the snapshot and simply absent here).
            if (v.Hand != null)
                foreach (var c in v.Hand) { var ci = GetOrUpdate(c); ci.Zone = Zone.Hand; p.Hand.Add(ci); }

            if (v.Board != null)
                foreach (var c in v.Board) { var ci = GetOrUpdate(c); ci.Zone = Zone.Board; state.Board.SetAt(v.Id, c.SlotIndex, ci); }

            if (v.Graveyard != null)
                foreach (var c in v.Graveyard) { var ci = GetOrUpdate(c); ci.Zone = Zone.Graveyard; p.Graveyard.Add(ci); }
        }

        private CardInstance GetOrUpdate(CardDto dto)
        {
            if (!_cache.TryGetValue(dto.InstanceId, out var ci))
            {
                var libDef = CardLibrary.Get(dto.CardId);
                if (libDef == null && _warnedMissing.Add(dto.CardId ?? "<null>"))
                    UnityEngine.Debug.LogWarning($"[CardLibrary] No card registered for id '{dto.CardId}' — " +
                        "showing the id as a placeholder (no name/art/text). Add it to CardLibraryMB and re-export cards.json.");

                var def = libDef != null ? libDef.ToCardDef() : Placeholder(dto);
                def.baseHealth = dto.MaxHealth; // so GetMaxHealth() matches the server's value at creation
                ci = new CardInstance(dto.InstanceId, def, dto.Owner);
                _cache[dto.InstanceId] = ci;
            }

            // Update mutable per-instance state from the authoritative snapshot.
            ci.Attack = dto.Attack;
            ci.Health = dto.Health;
            ci.CurrentCost = dto.CurrentCost;
            ci.SummonedTurn = dto.SummonedTurn;
            ci.Keywords.Clear();
            if (dto.Keywords != null)
                foreach (var k in dto.Keywords) ci.Keywords.Add(k);

            return ci;
        }

        private static CardDef Placeholder(CardDto dto) => new CardDef
        {
            cardId = dto.CardId,
            displayName = dto.CardId ?? "?",
            type = dto.Type,
            cost = dto.CurrentCost,
            baseAttack = dto.Attack,
            baseHealth = dto.MaxHealth,
            keywords = System.Array.Empty<Keyword>(),
            effects = System.Array.Empty<EffectDefinition>()
        };
    }
}
