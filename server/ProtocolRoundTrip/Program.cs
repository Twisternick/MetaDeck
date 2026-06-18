using System;
using System.Collections.Generic;
using MetaDeck.Core;
using MetaDeck.Data;
using MetaDeck.Engine;
using MetaDeck.Engine.Commands;
using MetaDeck.Events;
using MetaDeck.Protocol;
using MetaDeck.Rules;

int failures = 0;
void Check(string name, bool ok, string detail = null)
{
    Console.WriteLine($"  [{(ok ? "PASS" : "FAIL")}] {name}{(!ok && detail != null ? $" — {detail}" : "")}");
    if (!ok) failures++;
}

Console.WriteLine("MetaDeck Phase C — protocol round-trip");

// --- Build a minimal authoritative match (pure engine, no Unity) ---
var bus = new EventBus();
var p1 = new PlayerState(PlayerId.P1, 30);
var p2 = new PlayerState(PlayerId.P2, 30);
var state = new GameState(p1, p2);
var engine = new GameEngine(state, bus);
var flow = new GameFlowStateMachine(engine, bus);

CardDef Goblin() => new CardDef
{
    cardId = "goblin", displayName = "Goblin", type = CardType.Monster,
    cost = 1, baseAttack = 2, baseHealth = 3,
    keywords = Array.Empty<Keyword>(), effects = Array.Empty<EffectDefinition>()
};

var inHand = new CardInstance("c1", Goblin(), PlayerId.P1) { Zone = Zone.Hand };
p1.Hand.Add(inHand);

var onBoard = new CardInstance("c2", Goblin(), PlayerId.P1) { Zone = Zone.Board, SummonedTurn = 1 };
state.Board.SetAt(PlayerId.P1, 0, onBoard);

var oppHand = new CardInstance("e1", Goblin(), PlayerId.P2) { Zone = Zone.Hand };
p2.Hand.Add(oppHand);

var index = new Dictionary<string, CardInstance> { ["c1"] = inHand, ["c2"] = onBoard, ["e1"] = oppHand };
CardInstance Resolve(string id) => id != null && index.TryGetValue(id, out var c) ? c : null;

// --- 1) Snapshot: hidden-info filtering survives a round-trip ---
Console.WriteLine("Snapshot:");
var snap = SnapshotBuilder.Build(state, PlayerId.P1);
var snapJson = ProtocolJson.Serialize(snap);
var snap2 = ProtocolJson.Deserialize<SnapshotDto>(snapJson);

Check("viewer preserved", snap2.Viewer == PlayerId.P1);
Check("own hand visible (1 card)", snap2.Players[0].Hand.Count == 1 && snap2.Players[0].Hand[0].InstanceId == "c1");
Check("own board visible at slot 0", snap2.Players[0].Board.Count == 1 && snap2.Players[0].Board[0].SlotIndex == 0);
Check("opponent hand HIDDEN (count only)", snap2.Players[1].Hand.Count == 0 && snap2.Players[1].HandCount == 1);
Check("card stats carried", snap2.Players[0].Board[0].Attack == 2 && snap2.Players[0].Board[0].MaxHealth == 3);

// --- 2) Command: DTO -> JSON -> DTO -> real IGameCommand ---
Console.WriteLine("Command:");
var factory = new CommandFactory(Resolve, engine.Zones, engine.Effects, flow);

var playDto = new CommandDto { Kind = CommandKind.PlayCard, CardInstanceId = "c1", FromZone = Zone.Hand, Target = TargetDto.None() };
var playDto2 = ProtocolJson.Deserialize<CommandDto>(ProtocolJson.Serialize(playDto));
Check("PlayCard builds", factory.TryBuild(playDto2, out var playCmd, out var e1) && playCmd is PlayCardCommand, e1);

var faceDto = new CommandDto { Kind = CommandKind.BeginAttackFace, CardInstanceId = "c2" };
var faceDto2 = ProtocolJson.Deserialize<CommandDto>(ProtocolJson.Serialize(faceDto));
Check("BeginAttackFace builds", factory.TryBuild(faceDto2, out var faceCmd, out _) && faceCmd is BeginAttackCommand);

var endDto = ProtocolJson.Deserialize<CommandDto>(ProtocolJson.Serialize(new CommandDto { Kind = CommandKind.EndTurn }));
Check("EndTurn builds", factory.TryBuild(endDto, out var endCmd, out _) && endCmd is EndTurnCommand);

Check("unknown instance rejected", !factory.TryBuild(new CommandDto { Kind = CommandKind.PlayCard, CardInstanceId = "nope" }, out _, out _));

// --- 3) Events: engine events -> EventDto -> JSON -> EventDto ---
Console.WriteLine("Events:");
var faceDmg = EventMapper.Map(new PlayerDamaged(onBoard, PlayerId.P2, 3));
var faceDmg2 = ProtocolJson.Deserialize<EventDto>(ProtocolJson.Serialize(faceDmg));
Check("PlayerDamaged mapped", faceDmg2.Kind == EventKind.PlayerDamaged && faceDmg2.TargetPlayer == PlayerId.P2 && faceDmg2.Amount == 3);

var cardDmg = EventMapper.Map(new DamageDealt(onBoard, inHand, 2));
Check("DamageDealt vs card", cardDmg.Kind == EventKind.DamageDealt && cardDmg.TargetInstanceId == "c1");

var dmgVsPlayer = EventMapper.Map(new DamageDealt(onBoard, PlayerId.P2, 5));
Check("DamageDealt vs player", dmgVsPlayer.TargetPlayer == PlayerId.P2 && dmgVsPlayer.TargetInstanceId == null);

var over = ProtocolJson.Deserialize<EventDto>(ProtocolJson.Serialize(EventMapper.Map(new GameOver(PlayerId.P1, "P1 wins."))));
Check("GameOver mapped", over.Kind == EventKind.GameOver && over.Winner == PlayerId.P1 && over.Reason == "P1 wins.");

var draw = ProtocolJson.Deserialize<EventDto>(ProtocolJson.Serialize(EventMapper.Map(new GameOver(null, "Draw."))));
Check("GameOver draw (null winner)", draw.Winner == null);

// --- 4) Immediate combat: an attack resolves now and the phase stays Main ---
Console.WriteLine("Combat:");
onBoard.SummonedTurn = 0; // not summoning-sick this turn (turn 1)
int hpBefore = p2.Hp;
var attack = new BeginAttackCommand(flow, onBoard); // face attack
bool attackOk = engine.Submit(attack, out var attackReason);
Check("attack accepted", attackOk, attackReason);
Check("opponent took face damage", p2.Hp < hpBefore);
Check("phase stays Main (no chain window)", flow.Phase == GamePhase.Main);

Console.WriteLine();
Console.WriteLine(failures == 0 ? "ALL CHECKS PASSED" : $"{failures} CHECK(S) FAILED");
return failures == 0 ? 0 : 1;
