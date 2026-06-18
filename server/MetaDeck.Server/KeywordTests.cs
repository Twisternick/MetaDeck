using System;
using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Effects;
using MetaDeck.Engine;
using MetaDeck.Engine.Commands;
using MetaDeck.Engine.Mutations;
using MetaDeck.Events;
using MetaDeck.Rules;
using MetaDeck.Rules.Keywords.Registry;
using MetaDeck.Rules.Keywords.Service;
using MetaDeck.UI;

namespace MetaDeck.Server
{
    /// <summary>
    /// In-process engine tests for every gameplay keyword/condition, plus a scripted multi-turn mock
    /// battle that wires several keywords together. These run against real GameState objects through
    /// the same keyword-routing bus the server uses, so triggered keywords (Fear/Suppression) actually
    /// fire. No networking — this verifies the rules layer directly (hidden counters aren't in
    /// snapshots, so this is the only place they can be checked).
    /// </summary>
    public static class KeywordTests
    {
        public static int Run()
        {
            int failures = 0;
            void Check(string name, bool ok, string detail = null)
            {
                Console.WriteLine($"  [{(ok ? "PASS" : "FAIL")}] {name}{(!ok && detail != null ? " — " + detail : "")}");
                if (!ok) failures++;
            }

            Console.WriteLine("Keywords — engine rules self-test");

            // --- Guard ---
            {
                var z = new Arena();
                var atk = z.Place(PlayerId.P1, 0, 2, 2);
                var guard = z.Place(PlayerId.P2, 0, 1, 3, Keyword.Guard);
                var plain = z.Place(PlayerId.P2, 1, 1, 1);
                Check("Guard blocks face attack", !CombatRules.CanAttackFace(z.State, atk, out _));
                Check("Guard forces hitting the Guard first", !CombatRules.CanAttackMonster(z.State, atk, plain, out _));
                Check("Guard itself is a legal target", CombatRules.CanAttackMonster(z.State, atk, guard, out _));
            }

            // --- Structure: cannot attack ---
            {
                var z = new Arena();
                var s = z.Place(PlayerId.P1, 0, 3, 3, Keyword.Structure);
                Check("Structure cannot attack", !CombatRules.CanAttack(z.State, s, out _));
            }

            // --- Rush / summoning sickness ---
            {
                var z = new Arena();
                var sick = z.Place(PlayerId.P1, 0, 2, 2);
                sick.SummonedTurn = z.State.TurnNumber; // just summoned
                var rusher = z.Place(PlayerId.P1, 1, 2, 2, Keyword.Rush);
                rusher.SummonedTurn = z.State.TurnNumber;
                Check("freshly summoned monster has sickness", !CombatRules.CanAttack(z.State, sick, out _));
                Check("Rush ignores summoning sickness", CombatRules.CanAttack(z.State, rusher, out _));
            }

            // --- Stealth: untargetable, and drops after attacking ---
            {
                var z = new Arena();
                var stealth = z.Place(PlayerId.P2, 0, 2, 2, Keyword.Stealth);
                Check("Stealth is untargetable by enemies", CombatRules.IsUntargetableByEnemy(stealth, PlayerId.P1));
                var attacker = z.Place(PlayerId.P1, 0, 1, 5, Keyword.Stealth);
                z.Combat.ResolveFaceAttack(z.State, attacker, PlayerId.P2, z.Bus);
                Check("Stealth drops once the monster attacks", !attacker.HasKeyword(Keyword.Stealth));
            }

            // --- FirstStrike ---
            {
                var z = new Arena();
                var fs = z.Place(PlayerId.P1, 0, 2, 1, Keyword.FirstStrike);
                var def = z.Place(PlayerId.P2, 0, 2, 2);
                z.Combat.ResolveAttack(z.State, fs, def, z.Bus);
                Check("FirstStrike kills before retaliation", def.IsDestroyed && !fs.IsDestroyed);
            }

            // --- Fortify (damage pipeline) ---
            {
                var z = new Arena();
                var src = z.Place(PlayerId.P1, 0, 1, 1);
                var tgt = z.Place(PlayerId.P2, 0, 1, 5, Keyword.Fortify);
                CombatMath.DamageMonster(src, tgt, 3, z.Bus);
                Check("Fortify reduces incoming damage by 1", tgt.GetHealth() == 3, $"hp={tgt.GetHealth()}");
            }

            // --- PoweredUp (damage pipeline) ---
            {
                var z = new Arena();
                var src = z.Place(PlayerId.P1, 0, 1, 1);
                var tgt = z.Place(PlayerId.P2, 0, 1, 3, Keyword.PoweredUp);
                CombatMath.DamageMonster(src, tgt, 5, z.Bus);
                Check("PoweredUp absorbs the first hit", tgt.GetHealth() == 3 && !tgt.HasKeyword(Keyword.PoweredUp));
                CombatMath.DamageMonster(src, tgt, 2, z.Bus);
                Check("PoweredUp gone after absorbing", tgt.GetHealth() == 1, $"hp={tgt.GetHealth()}");
            }

            // --- Fear (triggered hook) ---
            {
                var z = new Arena();
                var attacker = z.Place(PlayerId.P1, 0, 1, 10, Keyword.Fear);
                var defender = z.Place(PlayerId.P2, 0, 3, 10);
                z.Combat.ResolveAttack(z.State, attacker, defender, z.Bus);
                Check("Fear lowers the defender's attack by 1", defender.GetAttack() == 2, $"atk={defender.GetAttack()}");
            }

            // --- Suppression (triggered hook) ---
            {
                var z = new Arena();
                var suppressor = z.Place(PlayerId.P1, 0, 1, 5, Keyword.Suppression);
                var victim = z.Place(PlayerId.P2, 0, 2, 5);
                CombatMath.DamageMonster(suppressor, victim, 1, z.Bus);
                Check("Suppression marks the victim suppressed", CombatRules.IsSuppressed(z.State, victim));
                z.State.ActivePlayer = PlayerId.P2; // so CanAttack tests suppression, not whose turn it is
                Check("Suppressed monster cannot attack", !CombatRules.CanAttack(z.State, victim, out _));
            }

            // --- Headshot ---
            {
                var z = new Arena();
                var hs = z.Place(PlayerId.P1, 0, 1, 10, Keyword.Headshot);
                var dmgd = z.Place(PlayerId.P2, 0, 3, 3);
                dmgd.Health = 1; // already damaged
                z.Combat.ResolveAttack(z.State, hs, dmgd, z.Bus);
                Check("Headshot executes a damaged target", dmgd.IsDestroyed);
            }

            // --- Devour ---
            {
                var z = new Arena();
                var dev = z.Place(PlayerId.P1, 0, 3, 3, Keyword.Devour);
                var prey = z.Place(PlayerId.P2, 0, 1, 1);
                z.Combat.ResolveAttack(z.State, dev, prey, z.Bus);
                Check("Devour grows +1/+1 on a kill", dev.GetAttack() == 4 && dev.GetMaxHealth() == 4);
            }

            // --- Overtake ---
            {
                var z = new Arena();
                var ot = z.Place(PlayerId.P1, 0, 3, 5, Keyword.Overtake);
                var prey = z.Place(PlayerId.P2, 0, 1, 1);
                z.Combat.ResolveAttack(z.State, ot, prey, z.Bus);
                Check("Overtake gains Nitro on attacking & surviving", z.State.GetPlayer(PlayerId.P1).Nitro == 1);
            }

            // --- DoubleJump (bypasses Guard once per turn) ---
            {
                var z = new Arena();
                var dj = z.Place(PlayerId.P1, 0, 2, 2, Keyword.DoubleJump);
                z.Place(PlayerId.P2, 0, 1, 3, Keyword.Guard);
                Check("DoubleJump bypasses Guard to hit face", CombatRules.CanAttackFace(z.State, dj, out _));
                dj.Counters[CombatRules.DoubleJumpTurnKey] = z.State.TurnNumber; // used its jump this turn
                Check("DoubleJump cannot bypass twice in a turn", !CombatRules.CanAttackFace(z.State, dj, out _));
            }

            // --- Checkpoint (death replacement) ---
            {
                var z = new Arena();
                var cp = z.Place(PlayerId.P1, 0, 2, 2, Keyword.Checkpoint);
                cp.Health -= 5; // lethal
                z.Cleanup.CleanupDeaths(z.State, z.Bus);
                Check("Checkpoint survives lethal at 1 HP and loses the keyword",
                    z.State.Board.GetAt(PlayerId.P1, 0) == cp && cp.GetHealth() == 1 && !cp.HasKeyword(Keyword.Checkpoint));
            }

            // --- Haunt (death curse + end-of-turn tick) ---
            {
                var z = new Arena();
                var haunter = z.Place(PlayerId.P1, 0, 1, 1, Keyword.Haunt);
                var cursed = z.Place(PlayerId.P2, 0, 2, 3);
                haunter.Health -= 5; // lethal
                z.Cleanup.CleanupDeaths(z.State, z.Bus);
                Check("Haunt curses a surviving enemy on death",
                    cursed.Counters.TryGetValue(CleanupResolver.HauntedCounterKey, out var h) && h >= 1
                    && z.State.Board.GetAt(PlayerId.P1, 0) == null);

                z.State.ActivePlayer = PlayerId.P2; // it's the cursed monster's controller's turn
                new EndTurnCommand(z.Zones).Execute(z.State, z.Bus);
                Check("Haunt ticks for 1 at the controller's end of turn", cursed.GetHealth() == 2, $"hp={cursed.GetHealth()}");
            }

            // --- LevelUp ---
            {
                var z = new Arena();
                var m = z.Place(PlayerId.P1, 0, 2, 2, Keyword.LevelUp);
                m.Counters[LevelUpRules.XpCounterKey] = LevelUpRules.Threshold;
                LevelUpRules.Refresh(m);
                Check("LevelUp grants +2/+2 at the XP threshold", m.GetAttack() == 4 && m.GetMaxHealth() == 4);
                m.Counters[LevelUpRules.XpCounterKey] = LevelUpRules.Threshold - 1;
                LevelUpRules.Refresh(m);
                Check("LevelUp bonus is removed below threshold", m.GetAttack() == 2 && m.GetMaxHealth() == 2);
            }

            // --- Momentum (condition) ---
            {
                var z = new Arena();
                var src = z.Place(PlayerId.P1, 0, 2, 2);
                Check("Momentum false before attacking",
                    !z.Rules.CheckCondition(z.State, src, SimpleCondition.FriendlyAttackedThisTurn));
                z.Combat.ResolveFaceAttack(z.State, src, PlayerId.P2, z.Bus);
                Check("Momentum true after a friendly attack",
                    z.Rules.CheckCondition(z.State, src, SimpleCondition.FriendlyAttackedThisTurn));
            }

            // --- Clutch (condition) ---
            {
                var z = new Arena();
                var src = z.Place(PlayerId.P1, 0, 2, 2);
                z.State.GetPlayer(PlayerId.P1).Hp = 10;
                z.State.GetPlayer(PlayerId.P2).Hp = 20;
                Check("Clutch true when below opponent's HP",
                    z.Rules.CheckCondition(z.State, src, SimpleCondition.HealthLessThanOpponent));
                z.State.GetPlayer(PlayerId.P1).Hp = 25;
                Check("Clutch false when not behind",
                    !z.Rules.CheckCondition(z.State, src, SimpleCondition.HealthLessThanOpponent));
            }

            // --- Tax (cost modifier) ---
            {
                var z = new Arena();
                z.Place(PlayerId.P2, 0, 1, 1, Keyword.Tax); // enemy Tax monster
                var spell = z.MakeCard(PlayerId.P1, SpellDef(cost: 1));
                z.State.GetPlayer(PlayerId.P1).Hand.Add(spell);
                spell.Zone = Zone.Hand;

                var p1 = z.State.GetPlayer(PlayerId.P1);
                p1.MaxBandwidth = 1; p1.Bandwidth = 1;
                var cmd = new PlayCardCommand(spell, Zone.Hand, TargetSpec.None(), false, z.Zones);
                Check("Tax makes a 1-cost spell unaffordable at 1 Bandwidth", !cmd.CanExecute(z.State, out _));
                p1.Bandwidth = 2;
                Check("Tax-ed spell is affordable at 2 Bandwidth", cmd.CanExecute(z.State, out _));
                cmd.Execute(z.State, z.Bus);
                Check("Tax charged the full +1 cost", p1.Bandwidth == 0, $"bw={p1.Bandwidth}");
            }

            // --- Populate / SummonToken (effect) ---
            {
                var z = new Arena();
                var src = z.Place(PlayerId.P1, 0, 1, 1);
                new SummonTokenEffect(2).Resolve(z.Ctx(src));
                var t1 = z.State.Board.GetAt(PlayerId.P1, 1);
                var t2 = z.State.Board.GetAt(PlayerId.P1, 2);
                Check("Populate summons 1/1 Citizen tokens into empty slots",
                    t1 != null && t2 != null && t1.GetAttack() == 1 && t1.GetMaxHealth() == 1
                    && t1.Def.cardId == SummonTokenEffect.TokenCardId);
            }

            // --- Generate (temporary resource) ---
            {
                var z = new Arena();
                var src = z.Place(PlayerId.P1, 0, 1, 1);
                var p1 = z.State.GetPlayer(PlayerId.P1);
                p1.Bandwidth = 1;
                new GenerateEffect(3).Resolve(z.Ctx(src));
                Check("Generate adds temporary Bandwidth", p1.Bandwidth == 4, $"bw={p1.Bandwidth}");
            }

            // --- Equip (attachment) ---
            {
                var z = new Arena();
                var host = z.Place(PlayerId.P1, 0, 2, 2);
                var enemy = z.Place(PlayerId.P2, 0, 2, 2);
                var equipper = z.MakeCard(PlayerId.P1, SpellDef(cost: 0));
                var fx = new EquipEffect(2, Keyword.Rush);
                Check("Equip rejects an enemy monster",
                    !fx.CanActivate(z.Ctx(equipper, enemy), out _));
                fx.Resolve(z.Ctx(equipper, host));
                Check("Equip grants +2/+2 and the keyword",
                    host.GetAttack() == 4 && host.GetMaxHealth() == 4 && host.HasKeyword(Keyword.Rush));
            }

            // --- Scripted mock battle combining keywords ---
            failures += MockBattle(Check);

            return failures;
        }

        /// <summary>
        /// A small deterministic skirmish: P1 fields a Fortify bruiser and an Overtake racer behind a
        /// Guard wall; P2 attacks into the wall and trades; a Checkpoint defender refuses to die.
        /// Verifies that several keywords interact correctly through the real combat/cleanup path.
        /// </summary>
        private static int MockBattle(Action<string, bool, string> check)
        {
            Console.WriteLine("  -- mock battle --");
            var z = new Arena();
            var combat = z.Combat;

            // P1 board: a Guard wall, a Fortify bruiser, an Overtake racer.
            var wall = z.Place(PlayerId.P1, 0, 1, 4, Keyword.Guard);
            var bruiser = z.Place(PlayerId.P1, 1, 3, 5, Keyword.Fortify);
            var racer = z.Place(PlayerId.P1, 2, 2, 3, Keyword.Overtake);

            // P2 board: a big attacker and a Checkpoint survivor.
            var raider = z.Place(PlayerId.P2, 0, 4, 4);
            var survivor = z.Place(PlayerId.P2, 1, 2, 2, Keyword.Checkpoint);

            // --- P2's turn: the raider attacks into the wall ---
            z.State.ActivePlayer = PlayerId.P2;

            // P2 must hit the Guard first; it cannot reach the bruiser or face.
            check("battle: Guard wall protects the backline", !CombatRules.CanAttackMonster(z.State, raider, bruiser, out _), null);

            // Raider trades into the wall: wall (4hp) dies, raider takes 1 and survives.
            combat.ResolveAttack(z.State, raider, wall, z.Bus);
            z.Cleanup.CleanupDeaths(z.State, z.Bus);
            check("battle: Guard dies clearing the lane", z.State.Board.GetAt(PlayerId.P1, 0) == null && !raider.IsDestroyed, null);

            // --- P1's turn: bruiser (Fortify) attacks raider. Raider deals 4 but Fortify cuts it to 3.
            z.State.ActivePlayer = PlayerId.P1;
            combat.ResolveAttack(z.State, bruiser, raider, z.Bus);
            z.Cleanup.CleanupDeaths(z.State, z.Bus);
            check("battle: Fortify bruiser survives the raider (5-3=2)", bruiser.GetHealth() == 2 && raider.IsDestroyed,
                $"bruiserHp={bruiser.GetHealth()} raiderDead={raider.IsDestroyed}");

            // Racer attacks the Checkpoint survivor: it would die but Checkpoint saves it at 1 HP.
            combat.ResolveAttack(z.State, racer, survivor, z.Bus);
            z.Cleanup.CleanupDeaths(z.State, z.Bus);
            check("battle: Checkpoint survivor clings to 1 HP",
                z.State.Board.GetAt(PlayerId.P2, 1) == survivor && survivor.GetHealth() == 1 && !survivor.HasKeyword(Keyword.Checkpoint), null);

            // Racer survived combat (survivor had only 2 atk vs 3 hp) -> Overtake granted Nitro.
            check("battle: Overtake racer earned Nitro by surviving", z.State.GetPlayer(PlayerId.P1).Nitro >= 1, null);

            // Now the lane is open: racer can swing face next turn.
            check("battle: face is reachable once Guards are gone", CombatRules.CanAttackFace(z.State, racer, out _), null);

            int fails = 0; // MockBattle reports through the shared checker; nothing extra to tally here.
            return fails;
        }

        // ---- helpers ----

        private sealed class Arena
        {
            public readonly GameState State;
            public readonly IEventBus Bus;
            public readonly CombatResolver Combat = new();
            public readonly CleanupResolver Cleanup;
            public readonly ZoneService Zones = new();
            public readonly RulesQueryService Rules = new();

            public Arena()
            {
                var p1 = new PlayerState(PlayerId.P1, 30);
                var p2 = new PlayerState(PlayerId.P2, 30);
                State = new GameState(p1, p2);

                // Same bus chain the server uses so triggered keywords (Fear/Suppression) fire.
                var inner = new EventBus();
                var registry = KeywordModule.BuildDefaultRegistry();
                var keywordService = new KeywordService(registry, new BoardOnlyCardQuery());
                var mutator = new GameMutator(inner);
                Bus = new KeywordRoutingEventBus(State, inner, keywordService, mutator);
                Cleanup = new CleanupResolver(Zones);
            }

            public CardInstance Place(PlayerId owner, int slot, int atk, int hp, params Keyword[] kws)
            {
                var c = MakeCard(owner, MonsterDef(atk, hp, kws));
                c.Zone = Zone.Board;
                c.SummonedTurn = -1; // no summoning sickness by default
                State.Board.SetAt(owner, slot, c);
                return c;
            }

            public CardInstance MakeCard(PlayerId owner, CardDef def)
                => new CardInstance(Guid.NewGuid().ToString("N"), def, owner);

            public EffectContext Ctx(CardInstance source, object target = null)
                => new EffectContext(State, Bus, source, new TargetSpec(target));
        }

        private static CardDef MonsterDef(int atk, int hp, Keyword[] kws) => new CardDef
        {
            cardId = "test_monster",
            displayName = "Test Monster",
            type = CardType.Monster,
            cost = 0,
            baseAttack = atk,
            baseHealth = hp,
            keywords = kws ?? Array.Empty<Keyword>(),
            effects = Array.Empty<EffectDefinition>()
        };

        private static CardDef SpellDef(int cost) => new CardDef
        {
            cardId = "test_spell",
            displayName = "Test Spell",
            type = CardType.Spell,
            cost = cost,
            keywords = Array.Empty<Keyword>(),
            effects = Array.Empty<EffectDefinition>()
        };
    }
}
