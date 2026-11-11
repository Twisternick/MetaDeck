// Builds readable rules text from effect data (port of the C# EffectText formatter).

import { CARDS } from '../data/index.js';
import { KEYWORDS, CHOSEN_TARGETINGS } from './constants.js';

const TARGET_NOUN = {
  Self: 'this',
  EnemyMonster: 'an enemy monster',
  FriendlyMonster: 'a friendly monster',
  OtherFriendlyMonster: 'another friendly monster',
  AnyMonster: 'a monster',
  EnemyCharacter: 'an enemy',
  EnemyPlayer: 'the enemy player',
  FriendlyPlayer: 'you',
  RandomEnemyMonster: 'a random enemy monster',
  RandomOtherFriendlyMonster: 'another random friendly monster',
  AllFriendlyMonsters: 'your monsters',
  AllOtherFriendlyMonsters: 'your other monsters',
  AllEnemyMonsters: 'all enemy monsters',
  AllMonsters: 'all monsters',
};

const TRIGGER_PREFIX = {
  play: 'Play: ',
  death: 'Death: ',
  turnStart: 'Turn start: ',
  turnEnd: 'Turn end: ',
  draw: 'Whenever you draw a card, ',
  allyDeath: 'Whenever another friendly monster dies, ',
};

const COND_PREFIX = {
  CardsPlayed1: "if you've played another card this turn",
  CardsPlayed2: "if you've played 2+ other cards this turn",
  Attacked3: "if you've attacked 3+ times this turn",
  FriendlyAttackedThisTurn: "if you've attacked this turn",
  ControlsDistrict: 'if you control a District',
  ControlsStructure: 'if you control a Structure',
  FriendlyBoardAtLeast3: 'if you control 3+ monsters',
  HealthLessThanOpponent: "if your HP is lower than your opponent's",
};

export const keywordName = k => KEYWORDS[k]?.name ?? k;

const plural = (n, noun, pluralNoun = `${noun}s`) => (n === 1 ? `a ${noun}` : `${numberWord(n)} ${pluralNoun}`);
const numberWord = n => ['zero', 'one', 'two', 'three', 'four', 'five'][n] ?? String(n);
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const signed = n => (n >= 0 ? `+${n}` : `${n}`);

function noun(e, usedChosen) {
  if (CHOSEN_TARGETINGS.has(e.targeting) && usedChosen) return 'it';
  const base = TARGET_NOUN[e.targeting] ?? e.targeting;
  if (e.cond === 'TargetMustBeDamaged') return base.replace(/^an? /, 'a damaged ');
  return base;
}

function sentence(e, t, prev) {
  const n = e.amount;
  const self = e.targeting === 'Self';
  const repeat = prev.some(p => p.effectType === e.effectType && p.targeting === e.targeting);
  switch (e.effectType) {
    case 'Draw': return n === 1 ? 'draw a card' : `draw ${n} cards`;
    case 'DealDamage':
      if (repeat) return `deal ${n} more damage${CHOSEN_TARGETINGS.has(e.targeting) ? ' to it' : ''}`;
      return `deal ${n} damage to ${t}`;
    case 'Buff': {
      const a = e.attack ?? n, h = e.health ?? n;
      if (self) return `gain ${repeat ? 'another ' : ''}${signed(a)}/${signed(h)}`;
      return `give ${t} ${repeat ? 'another ' : ''}${signed(a)}/${signed(h)}`;
    }
    case 'Equip': {
      const a = e.attack ?? n, h = e.health ?? n;
      return `equip ${t} with ${signed(a)}/${signed(h)}${e.keyword ? ` and ${keywordName(e.keyword)}` : ''}`;
    }
    case 'BuffAttackThisTurn': return `give ${t} +${n} ATK this turn`;
    case 'DebuffAttack': return `give ${t} -${n} ATK this turn`;
    case 'Heal':
      if (e.targeting === 'FriendlyPlayer') return `restore ${n} HP to you`;
      return n ? `restore ${n} health to ${t}` : `fully heal ${t}`;
    case 'Destroy': return `destroy ${t}`;
    case 'Silence': return `Silence ${t}`;
    case 'Suppress': return `Suppress ${t}`;
    case 'Bounce': return `return ${t} to its owner's hand`;
    case 'GrantKeyword': return self ? `gain ${keywordName(e.keyword)}` : `give ${t} ${keywordName(e.keyword)}`;
    case 'GrantKeywordThisTurn': return self ? `gain ${keywordName(e.keyword)} this turn` : `give ${t} ${keywordName(e.keyword)} this turn`;
    case 'RemoveKeyword': return `${t} lose ${keywordName(e.keyword)}`;
    case 'SummonToken': {
      const tok = CARDS[e.token];
      const stats = `${tok.baseAttack}/${tok.baseHealth}`;
      const shown = tok.keywords.filter(k => k !== tok.displayName);
      const kws = shown.length ? ` with ${shown.map(keywordName).join(' and ')}` : '';
      const count = Math.max(1, n);
      return `summon ${count === 1 ? `a ${stats} ${tok.displayName}` : `${numberWord(count)} ${stats} ${tok.plural}`}${kws}`;
    }
    case 'Revive': return 'Revive your most recently destroyed monster';
    case 'ReturnFromGraveyardToHand': return 'return the last card in your graveyard to your hand';
    case 'DiscardRandom': return e.targeting === 'FriendlyPlayer' ? 'discard a random card' : 'your opponent discards a random card';
    case 'RevealHand': return "reveal your opponent's hand this turn";
    case 'GainNitro': return `gain ${n} Nitro`;
    case 'GainXP': return self ? `gain ${n} XP` : `give ${t} ${n} XP`;
    case 'Generate': return `gain ${n} temporary Bandwidth`;
    case 'GainMaxBandwidth': return n === 1 ? 'gain an empty Bandwidth crystal' : `gain ${n} empty Bandwidth crystals`;
    case 'ShuffleGraveyardIntoDeck': return 'shuffle your graveyard into your deck';
    case 'CopyRandomHandCard': return 'copy a random card in your hand';
    default: return `[${e.effectType}]`;
  }
}

// Per-trigger groups of sentences, e.g. ["Play: Draw a card.", "Death: Gain 2 Nitro."]
export function rulesLines(def) {
  const groups = new Map();
  let usedChosen = false;
  const prev = [];
  for (const e of def.effects) {
    const trigger = e.trigger || 'play';
    if (!groups.has(trigger)) groups.set(trigger, []);
    const sentences = groups.get(trigger);
    const last = prev[prev.length - 1];
    // "Give X +1/+1. Give it Guard." reads better as "Give X +1/+1 and Guard."
    if (e.effectType === 'GrantKeyword' && last && last.effectType === 'Buff' && last.targeting === e.targeting
        && !e.cond && !e.nitroCost && (last.trigger || 'play') === trigger) {
      sentences[sentences.length - 1] = sentences[sentences.length - 1].replace(/.$/, ` and ${keywordName(e.keyword)}.`);
      prev.push(e);
      continue;
    }
    let s = sentence(e, noun(e, usedChosen), prev);
    if (CHOSEN_TARGETINGS.has(e.targeting)) usedChosen = true;
    if (e.cond && COND_PREFIX[e.cond]) s = `${COND_PREFIX[e.cond]}, ${s}`;
    if (e.nitroCost) s = `Boost ${e.nitroCost}: ${s}`;
    sentences.push(`${cap(s)}.`);
    prev.push(e);
  }
  const lines = [];
  for (const [trigger, sentences] of groups) {
    if (def.type === 'Spell' && trigger === 'play') { lines.push(sentences.join(' ')); continue; }
    const prefix = TRIGGER_PREFIX[trigger];
    const body = sentences.join(' ');
    lines.push(prefix.endsWith(', ') ? prefix + body.charAt(0).toLowerCase() + body.slice(1) : prefix + body);
  }
  return lines;
}

export function rulesText(def) {
  return rulesLines(def).join('\n');
}
