// The match screen: a full-screen arena rendered from engine state. Cards are dragged from the
// hand onto the mat to play them; attacks and targeted spells use a targeting arrow.
// Offline the human is player 0 and player 1 is the AI (or both are AIs when spectating). Online the
// server runs the game: this screen sends the human's moves and animates the updates it gets back.

import { h, delay } from './dom.js';
import { renderCard, renderCardBack, renderMinion, glossaryFor, statusLines } from './card-view.js';
import {
  motionOK, artSlot, heroArtUrls, cardArtUrls, impact, sparkle, dissolve, castFly, flyTo, dealFrom, lungeTransform,
  drawBeam, createArrow, showBanner, confetti, removeFx, keywordCallout, flashRing, hideTooltip,
  damageSplat, screenShake, hurtVignette,
} from './fx.js';
import {
  createGame, applyAction, legalActions, decisionPlayer, playInfo, attackInfo, attackTargets,
  effectiveCost, findMonster, playerRef, defOf, hasKeyword, attackBonuses,
} from '../engine/game.js';
import { chooseAction } from '../engine/ai.js';
import { getDeck, deckList, CARDS } from '../data/index.js';
import { BOARD_SLOTS, START_HP, KEYWORDS } from '../engine/constants.js';
import { rulesLines } from '../engine/text.js';
import { kwName, kwIcon, kwColor, kwKind, kwText, kwHint, richText, glossaryList } from './keywords.js';

const DRAG_THRESHOLD = 8;
const LONG_PRESS_MS = 380;

// myCards / oppCards are deck lists (card ids); without one, that side plays its archetype's whole pool.
// online = { seat, state, clock, send(msg), subscribe(fn) } plays a server match instead: state is the
// server's view for our seat, and onRematch is unused (rematches go through the server).
// Returns { close } so the caller can tear the screen down (online, when the server restarts the match).
// cosmetics = { back, arena, premium: Set of card ids } dresses the human's side. onResult({ won, damage })
// is called once when a match the human played ends; whatever it returns (the rewards) is shown on the
// game-over screen.
export function startMatch(root, { myDeck, oppDeck, myCards, oppCards, spectate = false, online = null, onExit, onRematch, cosmetics = null, onResult = null }) {
  const cos = { back: 'back:classic', arena: 'arena:standard', premium: new Set(), ...cosmetics };
  const HUMAN = online ? online.seat : 0;
  const OPP = 1 - HUMAN;
  const me = getDeck(online ? online.state.players[HUMAN].deckId : myDeck);
  const them = getDeck(online ? online.state.players[OPP].deckId : oppDeck);
  const state = online ? online.state : createGame({
    decks: [myCards ?? deckList(me.id), oppCards ?? deckList(them.id)],
    deckIds: [me.id, them.id],
    names: spectate ? [`${me.name} AI`, `${them.name} AI`] : ['You', `${them.name} AI`],
    firstPlayer: Math.random() < 0.5 ? 0 : 1,
  });

  const ui = {
    mode: 'idle',          // idle | target | attack
    source: null,          // uid of the card being played / monster attacking
    asResponse: false,
    targets: [],
    busy: false,           // AI acting or animating
    toast: null,
    speed: spectate ? 750 : 600,
    seenBoard: new Set(),  // uids already on the board (new ones get a summon animation)
    seenHand: new Set(),   // uids already in a hand (new ones are dealt from the deck pile)
    handCount: [0, 0],     // for face-down hands, which have no uids
    history: [],           // last played cards, newest first
    logOpen: false,
    kwOpen: false,         // keyword reference drawer
    lastTurnKey: null,
    celebrated: false,
    rewards: undefined,    // what onResult returned, once the match is over
    firstRender: true,
    drag: null,            // { kind: 'card' | 'minion', uid, el, x0, y0, moved }
    arrow: null,
    hoverTarget: null,
    inspect: null,
    zoom: null,            // long-press card zoom (touch)
    press: null,           // { x0, y0, timer } – a touch held on something zoomable
    reveal: null,          // { el, def } – opponent's card shown in the centre before it resolves
    pointer: { x: 0, y: 0 },
    quietUntil: 0,         // no hover popup until then (while callouts play)
    waiting: false,        // online: our move is sent and the server hasn't answered yet
    clock: null,           // online: { ends, total, response } for whoever has to move
    oppStatus: null,       // online: null | 'away' (disconnected, may come back) | 'left'
    awayUntil: null,       // online: when an 'away' opponent forfeits (local time)
    rematch: [],           // online: seats that asked for a rematch
    armedLeave: false,     // online: the Leave button was clicked once and now asks to confirm
  };
  const aiControls = pid => !online && (spectate || pid === OPP);
  // Elements that can be inspected, mapped to what they show: el -> () => [def, inst]
  const zoomables = new WeakMap();
  const zoomable = (el, get) => { zoomables.set(el, get); return el; };

  root.replaceChildren();
  const view = h('div', { class: 'match' });
  root.append(view);

  document.addEventListener('keydown', onKey);
  document.addEventListener('pointermove', onPointerMove, { passive: true });
  document.addEventListener('pointerup', onPointerUp);
  document.addEventListener('pointercancel', onPointerUp);
  view.addEventListener('pointerdown', onPressStart, true);
  view.addEventListener('pointerdown', onPointerDown);
  view.addEventListener('click', onClick);
  view.addEventListener('contextmenu', onContextMenu);
  window.addEventListener('resize', onResize);
  const clockTicker = online ? setInterval(tickClock, 250) : null;
  // Online: server messages are handled one at a time, so the animations of consecutive moves queue up.
  let inbox = Promise.resolve();
  const unsubscribe = online ? online.subscribe(msg => {
    inbox = inbox.then(() => onServer(msg)).catch(err => console.error(err));
  }) : null;

  function onKey(e) {
    if (e.key === 'Escape') {
      if ((ui.logOpen || ui.kwOpen) && ui.mode === 'idle') { ui.logOpen = false; ui.kwOpen = false; render(); } else cancel();
    }
  }
  function onResize() {
    fitHands();
    drawPendingBeam();
  }
  function teardown() {
    document.removeEventListener('keydown', onKey);
    document.removeEventListener('pointermove', onPointerMove);
    document.removeEventListener('pointerup', onPointerUp);
    document.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('resize', onResize);
    unsubscribe?.();
    clearInterval(clockTicker);
    ui.exited = true;
    stopArrow();
    hideInspect();
    endPress();
    hideReveal();
    removeFx();
  }
  function exit() {
    teardown();
    onExit();
  }

  // ------------------------------------------------------------ actions

  function cancel() {
    stopArrow();
    if (ui.mode === 'idle') return;
    ui.mode = 'idle';
    ui.source = null;
    ui.targets = [];
    render();
  }

  function toast(text) {
    ui.toast = text;
    render();
    const mine = text;
    setTimeout(() => { if (ui.toast === mine && !ui.drag) { ui.toast = null; render(); } }, 2200);
  }

  const applyLocal = action => {
    const res = applyAction(state, action);
    return res.ok ? { ...res, events: state.events.splice(0) } : res;
  };

  // Resolve an action and animate it. `apply` changes the state: offline it runs the engine, online
  // it adopts the state the server sent.
  async function act(action, apply = applyLocal) {
    stopArrow();
    hideInspect();
    const before = snapshot();
    const actor = decisionPlayer(state);

    // What to animate, decided from the pre-action state.
    let lunge = null;
    if (action.type === 'attack') lunge = { src: action.uid, tgt: action.target };
    else if (action.type === 'pass' && state.pending && state.pending.attacker !== undefined) lunge = { src: state.pending.attacker, tgt: state.pending.target };
    let played = null;
    if (action.type === 'play' || action.type === 'respond') {
      const card = state.players[actor].hand.find(c => c.uid === action.uid);
      if (card) {
        const def = defOf(card);
        const from = before.rects.get(`u${card.uid}`) ?? (ui.reveal ? ui.reveal.el.getBoundingClientRect() : null) ?? before.rects.get(actor === HUMAN ? 'handMine' : 'handTheirs');
        played = { def, uid: card.uid, deck: getDeck(state.players[actor].deckId), pid: actor, from, fontSize: before.fontSizes.get(`u${card.uid}`) ?? (ui.reveal ? '15px' : '9px'), target: action.target };
      }
    }
    hideReveal();

    const res = apply(action);
    ui.mode = 'idle';
    ui.source = null;
    ui.targets = [];
    if (!res.ok) { toast(res.reason); return false; }
    const events = res.events;
    if (events.some(e => e.type === 'keyword' || e.type === 'damage')) ui.quietUntil = Date.now() + 1400;
    for (const e of events) {
      if (e.type === 'play' && CARDS[e.id]) {
        ui.history.unshift({ def: CARDS[e.id], pid: e.pid, key: `${state.turn}-${e.uid}` });
        ui.history.length = Math.min(ui.history.length, 7);
      }
    }

    // The attack resolved now (not parked as a pending attack awaiting a response): lunge first.
    const resolved = lunge && !(state.pending && state.pending.attacker === lunge.src);
    if (resolved && motionOK()) {
      const srcEl = elFor(lunge.src);
      const from = before.rects.get(keyFor(lunge.src));
      const to = before.rects.get(keyFor(lunge.tgt));
      if (srcEl && from && to) {
        srcEl.style.transition = 'transform .17s cubic-bezier(.5,0,1,1)';
        srcEl.style.transform = lungeTransform(from, to);
        srcEl.style.zIndex = '30';
        await delay(175);
      }
    }

    // A monster played from the hand flies to its slot; hide the slot until it lands.
    const summoned = played && played.def.type === 'Monster' ? events.find(e => e.type === 'summon') : null;
    render();

    if (resolved && motionOK()) {
      const from = before.rects.get(keyFor(lunge.src));
      const to = before.rects.get(keyFor(lunge.tgt));
      const el = elFor(lunge.src);
      if (el && from && to) {
        el.style.transition = 'none';
        el.style.transform = lungeTransform(from, to);
        el.style.zIndex = '30';
        void el.offsetWidth;
        el.style.transition = 'transform .5s cubic-bezier(.34,1.56,.64,1)';
        el.style.transform = '';
        setTimeout(() => { el.style.transition = ''; el.style.zIndex = ''; }, 520);
      }
    }
    if (played && motionOK() && played.from) {
      const ghost = renderCard(played.def, { classes: 'cast', ownerDeckId: played.deck.id, premium: isPremium(played.def, played.pid) });
      ghost.style.fontSize = played.fontSize;
      if (summoned) {
        const minionEl = elFor(summoned.uid);
        if (minionEl) {
          minionEl.style.animationDelay = '.3s';
          flyTo(ghost, played.from, minionEl.getBoundingClientRect(), { duration: 330, onDone: () => impact(minionEl.getBoundingClientRect(), played.deck.color, { sparks: 12, size: .9 }) });
        }
      } else if (played.def.type === 'Spell') {
        const targetRect = played.target !== undefined ? before.rects.get(keyFor(played.target)) : null;
        castFly(ghost, played.from, targetRect ?? before.rects.get('mat'), played.deck.color);
      }
    }
    animate(events, before);
    return true;
  }

  // Let the AI take every decision that is currently its to make.
  async function pump() {
    if (ui.busy) return;
    ui.busy = true;
    render();
    try {
      while (!state.over && !ui.exited && aiControls(decisionPlayer(state))) {
        await delay(ui.speed);
        if (ui.exited) return;
        const action = chooseAction(state);
        if (action.type === 'attack' || action.type === 'play' || action.type === 'respond') {
          highlightIntent(action);
          await delay(action.type === 'attack' ? ui.speed * 0.6 : ui.speed * 1.4);
          if (ui.exited) return;
        }
        await act(action);
      }
    } finally {
      ui.busy = false;
      render();
    }
  }

  function humanCanAct() {
    return !spectate && !state.over && !ui.busy && !ui.waiting && decisionPlayer(state) === HUMAN;
  }

  // A move by the human. Offline it resolves here and the AI answers; online it goes to the server,
  // whose 'update' comes back through onServer like the opponent's moves.
  function submit(action) {
    if (!online) return act(action).then(pump);
    stopArrow();
    hideInspect();
    ui.mode = 'idle';
    ui.source = null;
    ui.targets = [];
    ui.waiting = true;
    online.send({ t: 'action', action });
    render();
  }

  // ------------------------------------------------------------ online

  async function onServer(msg) {
    if (ui.exited) return;
    switch (msg.t) {
      case 'update': {
        setClock(msg.clock);
        const mine = msg.actor === HUMAN;
        if (mine) ui.waiting = false;
        if (!msg.action) { // forfeit: nothing to animate
          Object.assign(state, msg.state);
          render();
          return;
        }
        if (!mine) {
          // The opponent's card is face-down in our view until the server names it.
          if (msg.card) revealCard(msg.actor, msg.action.uid, msg.card);
          ui.busy = true;
          render();
          const t = msg.action.type;
          if (t === 'attack' || t === 'play' || t === 'respond') {
            highlightIntent(msg.action);
            await delay(t === 'attack' ? ui.speed * 0.6 : ui.speed * 1.4);
            if (ui.exited) return;
          }
        }
        await act(msg.action, () => {
          Object.assign(state, msg.state);
          return { ok: true, events: msg.events };
        });
        ui.busy = false;
        if (msg.timeout) toast(mine ? outOfTime(msg) : "The opponent's clock ran out.");
        else render();
        return;
      }
      case 'reject':
        ui.waiting = false;
        toast(msg.reason);
        return;
      case 'error': // e.g. the server throttling a flood of messages
        ui.waiting = false;
        toast(msg.message);
        return;
      case 'opponentAway':
        ui.oppStatus = 'away';
        ui.awayUntil = Date.now() + (msg.grace ?? 0);
        toast('Opponent disconnected. Waiting for them to come back…');
        return;
      case 'opponentBack':
        ui.oppStatus = null;
        ui.awayUntil = null;
        toast('Opponent reconnected.');
        return;
      case 'opponentLeft':
        ui.oppStatus = 'left';
        ui.awayUntil = null;
        render();
        return;
      case 'rematch':
        ui.rematch = msg.seats;
        render();
        return;
    }
  }

  function revealCard(pid, uid, id) {
    const hand = state.players[pid].hand;
    if (hand.some(c => c.uid === uid)) return;
    const i = hand.findIndex(c => c.hidden);
    if (i >= 0) hand[i] = { uid, id, owner: pid };
  }

  const fmtClock = ms => {
    const secs = Math.max(0, Math.ceil(ms / 1000));
    return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
  };

  // Running out the clock on whole turns in a row forfeits the match, so say how close that is.
  function outOfTime(msg) {
    const left = msg.idle && msg.action?.type === 'end' ? msg.idle.limit - msg.idle.missed : null;
    if (!left || left < 1) return 'Out of time.';
    return `Out of time. Miss ${left === 1 ? 'one more turn' : `${left} more turns`} in a row and you forfeit.`;
  }

  function setClock(clock) {
    ui.clock = clock ? { ends: Date.now() + clock.left, total: clock.total, response: clock.response } : null;
  }

  // Update the clock pill in place (a full render four times a second would fight the animations).
  function tickClock() {
    const away = view.querySelector('.away-clock');
    if (away && ui.awayUntil) away.textContent = fmtClock(ui.awayUntil - Date.now());
    const pill = view.querySelector('.clock-pill');
    if (!pill || !ui.clock) return;
    const left = Math.max(0, ui.clock.ends - Date.now());
    const secs = Math.ceil(left / 1000);
    pill.querySelector('b').textContent = fmtClock(left);
    pill.style.setProperty('--pct', `${(left / ui.clock.total) * 100}%`);
    pill.classList.toggle('urgent', secs <= 15);
  }

  // Play a card from the hand (after a click or a drop on the mat).
  function beginPlay(card) {
    if (!humanCanAct()) return;
    const asResponse = !!state.pending;
    const info = playInfo(state, HUMAN, card, { asResponse });
    if (!info.ok) return toast(info.reason);
    if (info.targets && info.targets.length) {
      ui.mode = 'target';
      ui.source = card.uid;
      ui.asResponse = asResponse;
      ui.targets = info.targets;
      render();
      startArrow('#34f5a2');
      return;
    }
    submit({ type: asResponse ? 'respond' : 'play', uid: card.uid });
  }

  function beginAttack(m) {
    if (!humanCanAct() || m.owner !== HUMAN) return false;
    if (state.pending) { toast('Respond with a Quick card, or let the attack through.'); return false; }
    const info = attackInfo(state, m);
    if (!info.ok) { toast(info.reason); return false; }
    const targets = attackTargets(state, m);
    if (!targets.length) { toast('No legal attack targets.'); return false; }
    ui.mode = 'attack';
    ui.source = m.uid;
    ui.targets = targets;
    render();
    startArrow('#ff4d6d');
    return true;
  }

  function clickTarget(ref) {
    if (!ui.targets.includes(ref)) {
      if (ui.mode !== 'idle' && ref === ui.source) return cancel();
      return toast(explainBadTarget(ref));
    }
    const action = ui.mode === 'attack'
      ? { type: 'attack', uid: ui.source, target: ref }
      : { type: ui.asResponse ? 'respond' : 'play', uid: ui.source, target: ref };
    submit(action);
  }

  // Why a click during targeting did nothing, naming the keyword that is in the way.
  function explainBadTarget(ref) {
    const tgt = typeof ref === 'string' ? null : findMonster(state, ref);
    if (ui.mode !== 'attack') {
      if (tgt && hasKeyword(tgt, 'Stealth') && tgt.owner !== HUMAN) return `${kwIcon('Stealth')} Stealth: enemy effects can't target it until it attacks.`;
      return 'Not a valid target for this card.';
    }
    const att = findMonster(state, ui.source);
    if (tgt && tgt.owner === HUMAN) return "That's your own monster.";
    if (tgt && hasKeyword(tgt, 'Stealth')) return `${kwIcon('Stealth')} Stealth: it can't be attacked until it attacks.`;
    const guardUp = state.players[OPP].board.some(x => x && hasKeyword(x, 'Guard'));
    if (guardUp && att && !hasKeyword(att, 'DoubleJump') && !(tgt && hasKeyword(tgt, 'Guard'))) return `${kwIcon('Guard')} Guard: you must attack a Guard monster first.`;
    return "Can't attack that.";
  }

  function endTurn() {
    if (!humanCanAct() || state.pending) return;
    submit({ type: 'end' });
  }

  function passResponse() {
    if (!humanCanAct() || !state.pending) return;
    submit({ type: 'pass' });
  }

  // ------------------------------------------------------------ pointer: drag & drop, arrow

  function refAt(x, y) {
    const hit = document.elementFromPoint(x, y);
    const el = hit instanceof Element ? hit.closest('[data-uid],[data-pid]') : null;
    const ref = !el || !view.contains(el) ? null
      : el.dataset.pid !== undefined ? playerRef(Number(el.dataset.pid)) : Number(el.dataset.uid);
    // Attacking: anything on the enemy side that isn't a monster is the enemy hero ("going face").
    if (ui.mode === 'attack' && (ref === null || (typeof ref === 'number' && !findMonster(state, ref))) && inFaceZone(x, y, hit)) return playerRef(OPP);
    return ref;
  }
  // Above the mat's centre line, away from buttons and drawers.
  function inFaceZone(x, y, hit) {
    if (hit instanceof Element && hit.closest('button, .hud, .log-drawer, .history, .action-dock, .board.mine')) return false;
    const div = view.querySelector('.divider');
    if (!div) return false;
    const r = div.getBoundingClientRect();
    return y < r.top + r.height / 2;
  }
  function overMat(x, y) {
    const mat = view.querySelector('.mat');
    if (!mat) return false;
    const r = mat.getBoundingClientRect();
    return x >= r.left && x <= r.right && y >= r.top - 20 && y <= r.bottom + 20;
  }

  function onPointerDown(e) {
    if (e.button !== 0 || !(e.target instanceof Element)) return;
    hideInspect();
    if (ui.mode !== 'idle') {
      // Clicking the card or monster that is choosing a target cancels.
      const src = elFor(ui.source);
      if (src && src.contains(e.target)) cancel();
      return;
    }
    if (!humanCanAct()) return;
    const cardEl = e.target.closest('.hand.mine .card');
    const minionEl = e.target.closest('.board.mine .minion');
    if (cardEl) {
      const uid = Number(cardEl.dataset.uid);
      const card = state.players[HUMAN].hand.find(c => c.uid === uid);
      if (!card) return;
      ui.drag = { kind: 'card', uid, card, el: cardEl, x0: e.clientX, y0: e.clientY, moved: false };
      e.preventDefault();
    } else if (minionEl) {
      const uid = Number(minionEl.dataset.uid);
      const m = findMonster(state, uid);
      if (!m) return;
      ui.drag = { kind: 'minion', uid, m, el: minionEl, x0: e.clientX, y0: e.clientY, moved: false };
      e.preventDefault();
    }
  }

  function onPointerMove(e) {
    ui.pointer = { x: e.clientX, y: e.clientY };
    if (ui.press && !ui.zoom && Math.hypot(e.clientX - ui.press.x0, e.clientY - ui.press.y0) > DRAG_THRESHOLD) endPress();
    const d = ui.drag;
    if (d) {
      const dx = e.clientX - d.x0;
      const dy = e.clientY - d.y0;
      if (!d.moved && Math.hypot(dx, dy) > DRAG_THRESHOLD) {
        d.moved = true;
        if (d.kind === 'card') {
          hideInspect();
          d.el.classList.add('dragging');
          view.querySelector('.arena')?.classList.add('drag-card');
        } else if (!beginAttack(d.m)) {
          ui.drag = null;
          return;
        }
      }
      if (d.moved && d.kind === 'card' && d.el.isConnected) {
        d.el.style.transform = `translate(${dx}px, ${dy}px) rotate(0deg) scale(1.05)`;
      }
    }
    if (ui.arrow) updateArrow(e.clientX, e.clientY);
  }

  function onPointerUp(e) {
    if (ui.zoom) suppressNextClick();
    endPress();
    const d = ui.drag;
    if (!d) return;
    ui.drag = null;
    if (!d.moved) {
      // A click. Cards play, monsters start an attack (with the arrow following the pointer).
      if (d.kind === 'card') beginPlay(d.card);
      else beginAttack(d.m);
      return;
    }
    if (d.kind === 'card') {
      d.el.classList.remove('dragging');
      view.querySelector('.arena')?.classList.remove('drag-card');
      d.el.style.transform = '';
      if (overMat(e.clientX, e.clientY)) beginPlay(d.card);
      else render();
      return;
    }
    // Dragged a monster: release over a valid target to attack, anywhere else to cancel
    // (saying why when it was dropped on something it can't hit).
    const ref = refAt(e.clientX, e.clientY);
    if (ref !== null && ui.targets.includes(ref)) clickTarget(ref);
    else {
      const why = ref !== null && ref !== d.uid ? explainBadTarget(ref) : null;
      cancel();
      if (why) toast(why);
    }
  }

  // Click-to-attack: a click on the enemy side outside any monster hits the enemy hero.
  function onClick(e) {
    if (ui.mode !== 'attack' || !(e.target instanceof Element) || e.target.closest('[data-uid],[data-pid]')) return;
    const ref = refAt(e.clientX, e.clientY);
    if (ref === playerRef(OPP)) clickTarget(ref);
  }

  // Touch: press and hold a card or monster to zoom it; lifting the finger closes it and
  // cancels the tap or drag it began.
  function onPressStart(e) {
    endPress();
    if (e.pointerType !== 'touch' || !(e.target instanceof Element)) return;
    let el = e.target;
    while (el && el !== view && !zoomables.has(el)) el = el.parentElement;
    const get = el && zoomables.get(el);
    if (!get) return;
    ui.press = {
      x0: e.clientX, y0: e.clientY,
      timer: setTimeout(() => {
        const args = ui.press && el.isConnected ? get() : null;
        if (!args) return;
        ui.drag = null;
        navigator.vibrate?.(12);
        showZoom(...args);
      }, LONG_PRESS_MS),
    };
  }
  function endPress() {
    if (ui.press) clearTimeout(ui.press.timer);
    ui.press = null;
    ui.zoom?.remove();
    ui.zoom = null;
  }
  function onContextMenu(e) {
    if (ui.press || ui.zoom) e.preventDefault();
  }
  function suppressNextClick() {
    const stop = e => { e.stopPropagation(); e.preventDefault(); };
    document.addEventListener('click', stop, { capture: true, once: true });
    setTimeout(() => document.removeEventListener('click', stop, { capture: true }), 400);
  }
  function showZoom(def, inst) {
    ui.zoom?.remove();
    const owner = inst ? state.players[inst.owner].deckId : null;
    ui.zoom = h('div', { class: 'zoom', 'aria-hidden': 'true' },
      h('div', { class: 'zoom-inner' }, inspectParts(def, inst, { ownerDeckId: owner })));
    document.body.append(ui.zoom);
  }

  function startArrow(color) {
    stopArrow();
    ui.arrow = createArrow(color);
    updateArrow(ui.pointer.x, ui.pointer.y);
  }
  function updateArrow(x, y) {
    if (!ui.arrow) return;
    const src = elFor(ui.source);
    if (!src) return;
    ui.arrow.update(src.getBoundingClientRect(), x, y);
    const ref = refAt(x, y);
    const el = ref !== null && ui.targets.includes(ref) ? elFor(ref) : null;
    if (el !== ui.hoverTarget) {
      ui.hoverTarget?.classList.remove('hover-target');
      ui.hoverTarget = el;
      el?.classList.add('hover-target');
    }
    view.querySelector('.face-zone')?.classList.toggle('lit', ref === playerRef(OPP));
  }
  function stopArrow() {
    ui.arrow?.remove();
    ui.arrow = null;
    ui.hoverTarget?.classList.remove('hover-target');
    ui.hoverTarget = null;
  }

  // ------------------------------------------------------------ inspect popup & reveal

  function showInspect(def, inst, anchor, { tipsOnly = false } = {}) {
    hideInspect();
    // Right after an action, keep the hover popup closed so it does not cover the keyword callouts.
    if (ui.drag || ui.zoom || window.innerWidth < 900 || Date.now() < ui.quietUntil) return;
    const ownerDeckId = inst ? state.players[inst.owner].deckId : null;
    const parts = inspectParts(def, inst, { tipsOnly, ownerDeckId });
    if (!parts.length) return;
    placeInspect(h('div', { class: `inspect${tipsOnly ? ' tips' : ''}`, role: 'tooltip' }, parts), anchor, tipsOnly);
  }
  // The large card (unless only keyword tips are wanted), live status of a monster, and a glossary.
  function inspectParts(def, inst, { tipsOnly = false, ownerDeckId = null } = {}) {
    const parts = [];
    if (!tipsOnly) parts.push(renderCard(def, { classes: 'large', ownerDeckId, large: true, premium: isPremium(def, inst?.owner) }));
    if (inst) {
      const status = statusLines(state, inst);
      if (status.length) parts.push(h('div', { class: 'preview-status' }, status.map(s => h('div', null, s))));
    }
    const gloss = glossaryFor(def, inst);
    if (gloss.length) parts.push(glossaryList(gloss));
    return parts;
  }
  function placeInspect(el, anchor, tipsOnly) {
    document.body.append(el);
    ui.inspect = el;
    const r = anchor.getBoundingClientRect();
    const w = el.offsetWidth;
    const hgt = el.offsetHeight;
    const pad = tipsOnly ? r.width * .2 + 12 : 14;
    let left = r.right + pad;
    if (left + w > window.innerWidth - 8) left = r.left - w - pad;
    if (left < 8) left = 8;
    const top = Math.max(8, Math.min(r.top + r.height / 2 - hgt / 2, window.innerHeight - hgt - 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }
  function hideInspect() {
    ui.inspect?.remove();
    ui.inspect = null;
  }

  function showReveal(def, pid) {
    hideReveal();
    const mat = view.querySelector('.mat');
    if (!mat) return;
    const r = mat.getBoundingClientRect();
    const wrap = h('div', { class: 'reveal', 'aria-hidden': 'true' }, renderCard(def, { classes: 'large', ownerDeckId: state.players[pid].deckId, premium: isPremium(def, pid) }));
    document.body.append(wrap);
    wrap.style.left = `${r.left + r.width / 2 - wrap.offsetWidth / 2}px`;
    wrap.style.top = `${r.top + r.height / 2 - wrap.offsetHeight / 2}px`;
    ui.reveal = { el: wrap.firstChild, wrap, def };
  }
  function hideReveal() {
    ui.reveal?.wrap.remove();
    ui.reveal = null;
  }

  // ------------------------------------------------------------ animation

  // Element keys: monsters/cards by uid ("u12"), heroes by player ("p0"), plus a few regions.
  const keyFor = ref => (typeof ref === 'string' ? ref : `u${ref}`);
  const elFor = ref => (typeof ref === 'string'
    ? view.querySelector(`[data-pid="${ref.slice(1)}"]`)
    : view.querySelector(`[data-uid="${ref}"]`));

  function snapshot() {
    const rects = new Map();
    const clones = new Map();
    const fontSizes = new Map();
    for (const el of view.querySelectorAll('[data-uid],[data-pid]')) {
      const key = el.dataset.uid ? `u${el.dataset.uid}` : `p${el.dataset.pid}`;
      rects.set(key, el.getBoundingClientRect());
      if (el.classList.contains('minion')) {
        const c = el.cloneNode(true);
        c.classList.remove('can-attack', 'targetable', 'selected', 'tilting', 'enter', 'intent', 'attacking', 'defending', 'intent-target', 'hit', 'hover-target');
        c.style.transform = '';
        c.style.animationDelay = '';
        clones.set(key, c);
      } else if (el.classList.contains('card')) {
        fontSizes.set(key, getComputedStyle(el).fontSize);
      }
    }
    const region = (sel, key) => { const el = view.querySelector(sel); if (el) rects.set(key, el.getBoundingClientRect()); };
    region('.hand.mine', 'handMine');
    region('.hand.theirs', 'handTheirs');
    region('.mat', 'mat');
    return { rects, clones, fontSizes };
  }

  function animate(events, before) {
    let delayMs = 0;
    let splatDelay = 0;
    let shake = 0;
    let calloutDelay = 0;
    const stacks = new Map(); // element key -> callouts already shown on it in this batch
    const elOf = key => view.querySelector(key[0] === 'u' ? `[data-uid="${key.slice(1)}"]` : `[data-pid="${key.slice(1)}"]`);
    // A keyword announcement above a monster or hero: icon + KEYWORD + what it just did.
    const callout = (key, { keyword, icon, name, text, color }) => {
      const el = elOf(key);
      const rect = el ? el.getBoundingClientRect() : before.rects.get(key);
      if (!rect) return;
      const n = stacks.get(key) ?? 0;
      stacks.set(key, n + 1);
      const c = color ?? kwColor(keyword);
      keywordCallout(rect, { icon: icon ?? kwIcon(keyword), name: name ?? kwName(keyword), text, color: c, delay: calloutDelay, stack: n });
      if (n === 0) flashRing(el, rect, c, calloutDelay);
      calloutDelay = Math.min(calloutDelay + 160, 900);
    };
    for (const e of events) {
      const key = e.uid !== undefined && e.type !== 'play' && e.type !== 'draw' ? `u${e.uid}` : e.pid !== undefined ? `p${e.pid}` : null;
      if (!key) continue;
      if (e.type === 'keyword') { callout(key, { keyword: e.keyword, text: e.text }); continue; }
      if (e.type === 'suppress') { callout(key, { keyword: 'Suppression', name: 'Suppressed', text: "Can't attack next turn" }); continue; }
      if (e.type === 'silence') { callout(key, { keyword: 'Silence', name: 'Silenced', text: 'Loses keywords and text' }); continue; }
      if (e.type === 'fizzle' && !e.keyword) callout(key, { keyword: 'Quick', icon: '💨', name: 'Fizzle', text: e.why, color: '#9aa3c2' });
      let text = null, cls = '';
      switch (e.type) {
        case 'damage': text = e.amount === 'HEADSHOT' ? 'HEADSHOT' : e.amount ? `-${e.amount}` : '0'; cls = e.amount === 'HEADSHOT' ? 'dmg big' : 'dmg'; break;
        case 'heal': text = `+${e.amount}`; cls = 'heal'; break;
        case 'shield': case 'checkpoint': case 'levelup': case 'death': text = null; break; // announced by their keyword callouts
        case 'buff': text = e.text ?? '▲'; cls = e.temp ? 'heal small' : 'heal'; break;
        case 'debuff': text = e.text; cls = 'dmg small'; break;
        case 'fizzle': text = 'Fizzled'; cls = 'info'; break;
        case 'nitro': text = e.boost ? `🔥 Boost −${-e.amount}` : `Nitro ${e.amount > 0 ? '+' : ''}${e.amount}`; cls = 'nitro'; break;
        case 'bandwidth': text = `+${e.amount} Bandwidth`; cls = 'info'; break;
        case 'burn': text = 'Burned'; cls = 'info'; break;
        default: continue;
      }
      const el = elOf(key);
      const rect = el ? el.getBoundingClientRect() : before.rects.get(key);
      if (!rect) continue;

      if (e.type === 'death') {
        const clone = before.clones.get(key);
        if (clone) dissolve(clone, rect, getComputedStyle(clone).getPropertyValue('--deck') || '#ff4d6d');
        continue;
      }
      if (e.type === 'damage' && e.amount !== 0) {
        // Something was hurt: a splat that sits on it, a knock to the whole table, and for heroes
        // a draining health bar (and a red edge flash when it's you).
        const headshot = e.amount === 'HEADSHOT';
        const hero = key[0] === 'p';
        if (el) {
          el.classList.remove('hit');
          void el.offsetWidth;
          el.classList.add('hit');
        }
        impact(rect, headshot ? '#ffd166' : '#ff4d6d', { size: headshot ? 1.6 : hero ? 1.4 : 1, sparks: hero ? 22 : 14 });
        damageSplat(rect, headshot ? 'HEADSHOT' : `-${e.amount}`, { gold: headshot, delay: splatDelay });
        splatDelay = Math.min(splatDelay + 90, 360);
        shake = Math.max(shake, headshot || hero || e.amount >= 5 ? (hero && e.amount >= 5 ? 3 : 2) : 1);
        if (hero) {
          drainHpBar(el, e.pid, e.amount);
          if (Number(key.slice(1)) === HUMAN && !spectate) hurtVignette();
        }
        continue;
      }
      if (el && e.type === 'damage') {
        el.classList.remove('hit');
        void el.offsetWidth;
        el.classList.add('hit');
      }
      if (el && (e.type === 'heal' || e.type === 'buff' || e.type === 'levelup')) {
        el.classList.remove('healed');
        void el.offsetWidth;
        el.classList.add('healed');
        sparkle(rect, e.type === 'levelup' ? '#a78bfa' : '#34f5a2');
      }
      if (e.type === 'shield') sparkle(rect, '#38bdf8', 14);
      if (text) {
        const float = h('div', { class: `floater ${cls}` }, text);
        float.style.left = `${rect.left + rect.width / 2}px`;
        float.style.top = `${rect.top + rect.height / 2}px`;
        float.style.animationDelay = `${delayMs}ms`;
        document.body.append(float);
        setTimeout(() => float.remove(), 1150 + delayMs);
        delayMs = Math.min(delayMs + 60, 300);
      }
    }
    if (shake) screenShake(view.querySelector('.arena'), shake);
  }

  // A hero's health bar: the lost part flashes white, then drains away behind the new value.
  function drainHpBar(heroEl, pid, amount) {
    const bar = heroEl?.closest('.hero-panel')?.querySelector('.hp-bar');
    if (!bar || typeof amount !== 'number') return;
    const pct = hp => `${Math.max(0, Math.min(100, (hp / START_HP) * 100))}%`;
    const hp = state.players[pid].hp;
    const chip = h('b', { class: 'hp-chip' });
    chip.style.width = pct(hp + amount);
    bar.prepend(chip);
    if (!motionOK()) { chip.remove(); return; }
    chip.animate([{ width: pct(hp + amount) }, { width: pct(hp + amount), offset: .4 }, { width: pct(hp) }],
      { duration: 900, easing: 'cubic-bezier(.5,0,.2,1)', fill: 'forwards' }).onfinish = () => chip.remove();
  }

  function highlightIntent(action) {
    const pid = decisionPlayer(state);
    if (action.type === 'attack') {
      const src = view.querySelector(`[data-uid="${action.uid}"]`);
      if (src) src.classList.add('intent');
      if (action.target !== undefined) {
        const tgt = elFor(action.target);
        if (tgt) tgt.classList.add('intent-target');
      }
      return;
    }
    // Playing a card: reveal it in the centre of the mat (and point at its target).
    const card = state.players[pid].hand.find(c => c.uid === action.uid);
    if (!card) return;
    const handCard = view.querySelector(`[data-uid="${action.uid}"]`);
    if (handCard) handCard.classList.add('intent');
    showReveal(defOf(card), pid);
    if (action.target !== undefined) {
      const tgt = elFor(action.target);
      if (tgt) tgt.classList.add('intent-target');
    }
  }

  function drawPendingBeam() {
    document.querySelectorAll('.beam').forEach(b => b.remove());
    if (ui.exited || !state.pending || state.pending.attacker === undefined) return;
    const a = elFor(state.pending.attacker);
    const t = elFor(state.pending.target);
    if (a && t) drawBeam(a.getBoundingClientRect(), t.getBoundingClientRect());
  }

  function announceTurn() {
    const key = `${state.turn}:${state.active}`;
    if (key === ui.lastTurnKey || state.over) return;
    ui.lastTurnKey = key;
    const p = state.players[state.active];
    const text = spectate ? `${p.name}` : state.active === HUMAN ? 'YOUR TURN' : 'ENEMY TURN';
    const cls = state.active === HUMAN ? 'good' : 'enemy';
    if (ui.firstRender) setTimeout(() => { if (!ui.exited) showBanner(text, cls); }, 500);
    else showBanner(text, cls);
  }

  // Deal newly drawn cards in from the owner's deck pile.
  function animateDeals() {
    let i = 0;
    for (const pid of [HUMAN, OPP]) {
      const hand = view.querySelector(pid === HUMAN ? '.hand.mine' : '.hand.theirs');
      const pile = view.querySelector(`.piles.${pid === HUMAN ? 'mine' : 'theirs'} .pile.deck`);
      if (!hand || !pile) continue;
      const pileRect = pile.getBoundingClientRect();
      const cards = [...hand.children];
      let fresh = cards.filter(c => c.classList.contains('enter-hand'));
      if (!fresh.length && cards.length && !cards[0].dataset.uid) {
        // Face-down hand: the last N backs are new.
        const n = state.players[pid].hand.length - ui.handCount[pid];
        if (n > 0) fresh = cards.slice(-n);
      }
      for (const c of fresh) dealFrom(c, pileRect, ui.firstRender ? i++ * 90 : i++ * 60);
    }
  }

  // ------------------------------------------------------------ render

  function render() {
    if (ui.exited) return;
    hideInspect();
    hideTooltip();
    const responding = !spectate && state.pending && state.pending.responder === HUMAN && !ui.busy;
    if (state.over && ui.rewards === undefined) {
      ui.rewards = !spectate && onResult
        ? onResult({ won: state.winner === HUMAN, damage: Math.max(0, START_HP - Math.max(0, state.players[OPP].hp)) }) ?? null
        : null;
    }
    view.replaceChildren(...[
      h('div', { class: `arena${ui.mode === 'attack' ? ' targeting' : ''}`, 'data-arena': cos.arena.split(':')[1], style: { '--my-deck': me.color, '--their-deck': them.color } },
        h('div', { class: 'zone top' },
          renderHud(),
          renderHand(OPP),
          h('div', { class: 'corner theirs' }, renderPiles(OPP), renderHeroPanel(OPP))),
        h('div', { class: 'mat' },
          ui.mode === 'attack' ? renderFaceZone() : null,
          renderBoard(OPP),
          renderDivider(),
          renderBoard(HUMAN)),
        h('div', { class: 'zone bottom' },
          h('div', { class: 'corner mine' }, renderHeroPanel(HUMAN), renderPiles(HUMAN)),
          renderHand(HUMAN),
          h('div', { class: 'corner right' }, renderBandwidth(HUMAN, true))),
        renderHistory(),
        renderDock(responding),
        ui.logOpen ? renderLogDrawer() : null,
        ui.kwOpen ? renderKeywordDrawer() : null,
      ),
      state.over ? renderGameOver() : null,
      ui.toast ? h('div', { class: 'toast', role: 'status' }, ui.toast) : null,
    ].filter(Boolean));
    fitHands();
    drawPendingBeam();
    animateDeals();
    announceTurn();
    if (online) tickClock();
    for (const p of state.players) {
      for (const m of p.board) if (m) ui.seenBoard.add(m.uid);
      for (const c of p.hand) ui.seenHand.add(c.uid);
      ui.handCount[p.id] = p.hand.length;
    }
    if (state.over && !ui.celebrated) {
      ui.celebrated = true;
      stopArrow();
      if (state.winner === HUMAN || (spectate && state.winner !== 'draw')) {
        const deck = state.players[state.winner].deckId === me.id ? me : them;
        setTimeout(() => confetti(['#ffc53d', '#ffffff', deck.color, '#22d3ee', '#f472b6']), 200);
      }
    }
    ui.firstRender = false;
  }

  // Fan the hand into an arc and overlap cards just enough to fit the row.
  function fitHands() {
    for (const hand of view.querySelectorAll('.hand')) {
      const cards = [...hand.children];
      const n = cards.length;
      if (!n) continue;
      cards.forEach(c => { c.style.marginLeft = ''; });
      const spread = Math.min(16, n * 2);
      const drop = Math.min(cards[0].offsetHeight * 0.16, n * 4);
      hand.style.setProperty('--drop', `${drop.toFixed(1)}px`);
      cards.forEach((c, i) => {
        const t = n > 1 ? (i / (n - 1)) * 2 - 1 : 0;
        c.style.setProperty('--fan', `${(t * spread).toFixed(2)}deg`);
        c.style.setProperty('--lift', `${(t * t * drop).toFixed(1)}px`);
        c.style.setProperty('--i', i);
      });
      if (n < 2) continue;
      const w = cards[0].offsetWidth;
      const avail = hand.clientWidth - 24;
      const overlap = Math.min(-10, (avail - w * n) / (n - 1));
      cards.forEach((c, i) => { c.style.marginLeft = i ? `${overlap}px` : '0'; });
    }
  }

  function renderHud() {
    return h('div', { class: 'hud' },
      online && !state.over
        ? h('button', { class: `btn small ${ui.armedLeave ? 'danger' : 'ghost'}`, onclick: armLeave }, ui.armedLeave ? 'Forfeit & leave?' : '← Leave')
        : h('button', { class: 'btn ghost small', onclick: exit }, online ? '← Lobby' : '← Menu'),
      h('button', { class: `btn ghost small${ui.logOpen ? ' active' : ''}`, onclick: () => { ui.logOpen = !ui.logOpen; ui.kwOpen = false; render(); }, 'aria-pressed': ui.logOpen ? 'true' : 'false' }, 'Log'),
      h('button', { class: `btn ghost small${ui.kwOpen ? ' active' : ''}`, onclick: () => { ui.kwOpen = !ui.kwOpen; ui.logOpen = false; render(); }, 'aria-pressed': ui.kwOpen ? 'true' : 'false' }, '? Keywords'),
      h('span', { class: 'turn-pill' }, 'Turn', h('b', null, state.turn)),
      online && ui.clock && !state.over ? h('span', {
        class: `turn-pill clock-pill${decisionPlayer(state) === HUMAN ? ' mine' : ''}`,
        title: ui.clock.response ? 'Time left to respond' : 'Time left this turn',
      }, ui.clock.response ? 'Respond' : decisionPlayer(state) === HUMAN ? 'Your clock' : 'Their clock', h('b', null, '')) : null);
  }

  // Leaving a running online match forfeits it, so the first click only asks.
  function armLeave() {
    if (ui.armedLeave) return exit();
    ui.armedLeave = true;
    render();
    setTimeout(() => { if (ui.armedLeave) { ui.armedLeave = false; render(); } }, 3000);
  }

  function renderLogDrawer() {
    const drawer = h('div', { class: 'log-drawer' },
      h('h3', null, 'Match log'),
      h('div', { class: 'log', 'aria-live': 'polite' }, state.log.slice(-80).map(l => h('div', { class: 'log-line' }, l.text))));
    requestAnimationFrame(() => { const log = drawer.querySelector('.log'); if (log) log.scrollTop = log.scrollHeight; });
    return drawer;
  }

  // Reference drawer: every keyword on the board or in your hand first (with where it is), then the rest.
  function renderKeywordDrawer() {
    const where = new Map();
    const add = (k, w) => { if (!KEYWORDS[k]) return; if (!where.has(k)) where.set(k, new Set()); where.get(k).add(w); };
    for (const p of state.players) {
      for (const m of p.board) if (m) for (const k of [...m.kw, ...m.tempKw]) add(k, p.id === HUMAN && !spectate ? 'your board' : `${p.name}'s board`);
    }
    if (!spectate) {
      for (const c of state.players[HUMAN].hand) {
        const d = defOf(c);
        d.keywords.forEach(k => add(k, 'your hand'));
        d.effects.forEach(e => e.keyword && add(e.keyword, 'your hand'));
      }
    }
    const byName = (a, b) => kwName(a).localeCompare(kwName(b));
    const inPlay = [...where.keys()].sort(byName);
    const rest = Object.keys(KEYWORDS).filter(k => !where.has(k)).sort(byName);
    const row = (k, place) => h('div', { class: `kw-row kind-${kwKind(k)}`, style: { '--kw': kwColor(k) } },
      h('i', { class: 'kw-ico', 'aria-hidden': 'true' }, kwIcon(k)),
      h('div', { class: 'kw-row-body' },
        h('b', null, kwName(k), place ? h('span', { class: 'kw-where' }, place) : null),
        h('div', { class: 'kw-row-hint' }, kwHint(k)),
        h('div', { class: 'kw-row-text' }, kwText(k))));
    return h('div', { class: 'log-drawer kw-drawer' },
      h('h3', null, 'Keywords'),
      h('div', { class: 'log kw-list' },
        h('h4', null, 'In play'),
        inPlay.length ? inPlay.map(k => row(k, [...where.get(k)].join(' · '))) : h('p', { class: 'muted kw-empty' }, 'Nothing with a keyword is on the board or in your hand yet.'),
        h('h4', null, 'All keywords'),
        rest.map(k => row(k))));
  }

  function renderHistory() {
    if (!ui.history.length) return null;
    return h('div', { class: 'history', 'aria-label': 'Recently played cards' },
      h('div', { class: 'history-label' }, 'Played'),
      ui.history.map(({ def, pid, key }) => zoomable(h('div', {
        class: `history-tile ${pid === HUMAN ? 'mine' : 'theirs'}`,
        style: { '--deck': (getDeck(def.deckId) ?? getDeck(state.players[pid].deckId)).color },
        'data-key': key,
        onmouseenter: e => showInspect(def, null, e.currentTarget),
        onmouseleave: hideInspect,
      },
        artSlot('', cardArtUrls(def, state.players[pid].deckId), (getDeck(def.deckId) ?? getDeck(state.players[pid].deckId)).icon),
        h('span', { class: 'cost' }, def.cost)), () => [def])));
  }

  function renderHeroPanel(pid) {
    const p = state.players[pid];
    const deck = getDeck(p.deckId);
    const isTarget = ui.mode !== 'idle' && ui.targets.includes(playerRef(pid));
    const active = state.active === pid && !state.over;
    const pct = Math.max(0, Math.min(100, (p.hp / START_HP) * 100));
    return h('div', { class: `hero-panel ${pid === HUMAN ? 'mine' : 'theirs'}`, style: { '--deck': deck.color } },
      h('div', {
        class: `hero${isTarget ? ' targetable' : ''}${active ? ' active' : ''}${p.hp <= 10 ? ' low' : ''}`,
        'data-pid': pid,
        onclick: () => ui.mode !== 'idle' && clickTarget(playerRef(pid)),
        role: isTarget ? 'button' : null,
        'aria-label': `${p.name}: ${p.hp} HP`,
      },
        artSlot('hero-art', heroArtUrls(deck.id), deck.icon),
        h('div', { class: 'hero-hp', title: 'Health' }, p.hp),
      ),
      h('div', { class: 'hero-info' },
        h('div', { class: 'hero-name' }, p.name),
        h('div', { class: 'hero-deckname' }, deck.name),
        h('div', { class: 'hp-bar', 'aria-hidden': 'true' }, h('i', { class: pct > 34 ? 'good' : '', style: { '--hp-pct': `${pct}%` } })),
        pid === HUMAN ? null : renderBandwidth(pid, false),
        h('div', { class: 'hero-meta' },
          p.nitro || p.deckId === 'Racing' ? h('span', { class: 'nitro', title: 'Nitro' }, 'Nitro', h('b', null, p.nitro)) : null,
          p.fatigue ? h('span', { title: 'Fatigue' }, 'Fatigue', h('b', null, p.fatigue)) : null,
          p.hand.length && pid !== HUMAN ? h('span', { title: 'Cards in hand' }, 'Hand', h('b', null, p.hand.length)) : null),
      ),
    );
  }

  function renderBandwidth(pid, big) {
    const p = state.players[pid];
    return h('div', { class: `bandwidth${big ? ' big' : ''}`, title: 'Bandwidth (current / max)' },
      big ? h('span', { class: 'bw-label' }, 'Bandwidth') : null,
      Array.from({ length: Math.max(p.maxBw, p.bw) }, (_, i) => h('span', { class: `pip${i < p.bw ? ' full' : ''}${i >= p.maxBw ? ' temp' : ''}`, style: big ? { 'animation-delay': `${i * 40}ms` } : null })),
      h('span', { class: 'bw-num' }, `${p.bw}/${p.maxBw}`));
  }

  function renderPiles(pid) {
    const p = state.players[pid];
    const deck = getDeck(p.deckId);
    const topGrave = p.grave.length ? defOf(p.grave[p.grave.length - 1]) : null;
    const stack = Math.max(1, Math.min(4, Math.ceil(p.deck.length / 8)));
    return h('div', { class: `piles ${pid === HUMAN ? 'mine' : 'theirs'}` },
      h('div', { class: `pile deck${p.deck.length ? '' : ' empty'}`, title: `${p.deck.length} cards in deck` },
        h('span', { class: 'pile-label' }, 'Deck'),
        Array.from({ length: stack }, () => pid === HUMAN && cos.back !== 'back:classic'
          ? h('div', { class: 'pile-card skinned', 'data-back': cos.back.split(':')[1] }, h('div', { class: 'back-skin' }, h('span', null, 'M')))
          : h('div', { class: 'pile-card' }, 'M')),
        h('span', { class: 'pile-count' }, p.deck.length)),
      zoomable(h('div', {
        class: `pile grave${p.grave.length ? '' : ' empty'}`, title: `${p.grave.length} cards in graveyard`, style: { '--deck': deck.color },
        onmouseenter: topGrave ? e => showInspect(topGrave, null, e.currentTarget) : null, onmouseleave: hideInspect,
      },
        h('span', { class: 'pile-label' }, 'Grave'),
        h('div', { class: 'pile-card' }, topGrave ? artSlot('', cardArtUrls(topGrave, p.deckId), deck.icon) : '✖'),
        h('span', { class: 'pile-count' }, p.grave.length)), () => topGrave && [topGrave]));
  }

  function renderHand(pid) {
    const p = state.players[pid];
    const revealed = spectate || pid === HUMAN || p.revealedTurn === state.turn;
    if (!revealed) {
      return h('div', { class: 'hand theirs', 'aria-label': `${p.hand.length} cards in hand` },
        p.hand.map(() => renderCardBack('small')));
    }
    const responding = !!state.pending && state.pending.responder === pid;
    const mine = pid === HUMAN;
    return h('div', { class: `hand ${mine ? 'mine' : 'theirs'}` },
      p.hand.map(card => {
        const def = defOf(card);
        const info = mine && humanCanAct() ? playInfo(state, pid, card, { asResponse: responding }) : { ok: false };
        const classes = [
          mine ? '' : 'small',
          info.ok ? 'playable' : '',
          ui.source === card.uid && ui.mode === 'target' ? 'selected' : '',
          !ui.seenHand.has(card.uid) ? 'enter-hand' : '',
        ].join(' ');
        return zoomable(renderCard(def, {
          cost: effectiveCost(state, card),
          classes,
          ownerDeckId: p.deckId,
          premium: isPremium(def, pid),
          attrs: {
            'data-uid': card.uid,
            onmouseenter: e => showInspect(def, null, e.currentTarget, { tipsOnly: mine }),
            onmouseleave: hideInspect,
            onkeydown: mine ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); ui.mode === 'idle' ? beginPlay(card) : clickTarget(card.uid); } } : null,
            role: mine ? 'button' : null,
            tabindex: mine ? '0' : null,
            'aria-label': `${def.displayName}${info.ok ? ', playable' : ''}`,
          },
        }), () => [def]);
      }));
  }

  function renderBoard(pid) {
    const p = state.players[pid];
    const slots = [];
    for (let i = 0; i < BOARD_SLOTS; i++) {
      const m = p.board[i];
      if (!m) { slots.push(h('div', { class: 'slot empty' })); continue; }
      const canAttack = pid === HUMAN && humanCanAct() && !state.pending && attackInfo(state, m).ok;
      const classes = [
        canAttack && ui.mode === 'idle' ? 'can-attack' : '',
        ui.mode !== 'idle' && ui.targets.includes(m.uid) ? 'targetable' : '',
        ui.source === m.uid && ui.mode === 'attack' ? 'selected' : '',
        state.pending && state.pending.attacker === m.uid ? 'attacking' : '',
        state.pending && state.pending.target === m.uid ? 'defending' : '',
        !ui.seenBoard.has(m.uid) ? 'enter' : '',
      ].join(' ');
      slots.push(h('div', { class: 'slot' }, zoomable(renderMinion(state, m, {
        classes,
        premium: isPremium(defOf(m), m.owner),
        // My own monsters are driven by pointer events (click or drag). Click handlers exist only
        // for picking a target: the browser fires 'click' after 'pointerup', on whatever was
        // re-rendered under the pointer, so the source must never carry one.
        onclick: ui.mode !== 'idle' && (pid !== HUMAN || ui.targets.includes(m.uid)) ? () => clickTarget(m.uid) : null,
        onmouseenter: e => showInspect(defOf(m), m, e.currentTarget),
        onmouseleave: hideInspect,
      }), () => [defOf(m), m])));
    }
    return h('div', { class: `board ${pid === HUMAN ? 'mine' : 'theirs'}` }, slots);
  }

  // While attacking, the enemy half of the mat lights up as one big target for their hero.
  function renderFaceZone() {
    const open = ui.targets.includes(playerRef(OPP));
    const name = state.players[OPP].name;
    return [
      h('div', { class: `face-zone${open ? '' : ' blocked'}`, 'aria-hidden': 'true' }),
      h('div', { class: `face-label${open ? '' : ' blocked'}`, 'aria-hidden': 'true' },
        open ? ['⚔ Attack ', h('b', null, name), h('span', null, 'aim anywhere on their side')]
          : [`${kwIcon('Guard')} `, h('b', null, name), h('span', null, 'is protected by Guard')]),
    ];
  }

  function renderDivider() {
    let message;
    let thinking = false;
    let cls = '';
    if (state.over) message = 'Game over';
    else if (spectate) { message = `${state.players[state.active].name} is playing`; thinking = true; }
    else if (state.pending && state.pending.responder === HUMAN) {
      const att = findMonster(state, state.pending.attacker);
      const tgt = typeof state.pending.target === 'string' ? 'you' : defOf(findMonster(state, state.pending.target) ?? { id: 'token_citizen' }).displayName;
      message = `${att ? defOf(att).displayName : 'An enemy'} attacks ${tgt}! Respond with a Quick card?`;
      cls = 'alert';
    } else if (ui.mode === 'target') {
      const card = state.players[HUMAN].hand.find(c => c.uid === ui.source);
      message = [h('b', null, 'Choose a target'), card ? h('span', { class: 'mid-sub' }, richText(rulesLines(defOf(card)).join(' '))) : null];
      cls = 'mine';
    }
    else if (ui.mode === 'attack') {
      const att = findMonster(state, ui.source);
      const guardUp = state.players[OPP].board.some(x => x && hasKeyword(x, 'Guard'));
      const notes = [];
      if (att && guardUp && !hasKeyword(att, 'DoubleJump')) notes.push(`${kwIcon('Guard')} Guard is up: only Guard monsters can be attacked`);
      if (att && guardUp && hasKeyword(att, 'DoubleJump')) notes.push(`${kwIcon('DoubleJump')} Double Jump: ignores Guard`);
      if (att) for (const b of attackBonuses(state, att)) notes.push(`${kwIcon(b.keyword)} ${kwName(b.keyword)}: +${b.amount} ATK`);
      if (att && hasKeyword(att, 'Headshot')) notes.push(`${kwIcon('Headshot')} Headshot: destroys a damaged monster outright`);
      if (att && hasKeyword(att, 'FirstStrike')) notes.push(`${kwIcon('FirstStrike')} First Strike: hits first`);
      message = [h('b', null, 'Choose what to attack'), notes.length ? h('span', { class: 'mid-sub' }, notes.join(' · ')) : null];
      cls = 'mine';
    }
    else if (online && ui.oppStatus === 'away') {
      message = ['Opponent disconnected · they forfeit if not back in ', h('b', { class: 'away-clock' }, ui.awayUntil ? fmtClock(ui.awayUntil - Date.now()) : '')];
      thinking = true;
    }
    else if (decisionPlayer(state) === OPP) { message = state.pending ? 'Opponent is deciding on a response' : 'Opponent is thinking'; thinking = true; }
    else { message = 'Your turn · drag cards onto the mat · drag monsters to attack'; cls = 'mine'; }
    return h('div', { class: 'divider' }, h('div', { class: `mid-msg ${cls}${thinking ? ' thinking' : ''}` }, message));
  }

  function renderDock(responding) {
    if (spectate) return null;
    let button;
    if (responding) button = h('button', { class: 'btn danger', onclick: passResponse }, 'Let it through');
    else if (ui.mode !== 'idle') button = h('button', { class: 'btn ghost', onclick: cancel }, 'Cancel');
    else {
      const nothingLeft = humanCanAct() && !state.pending && !legalActions(state).some(a => a.type !== 'end');
      button = h('button', {
        class: `btn primary end-turn${nothingLeft ? ' pulse' : ''}`,
        onclick: endTurn,
        disabled: humanCanAct() && !state.pending ? null : true,
      }, 'End turn');
    }
    return h('div', { class: 'action-dock' }, button,
      ui.mode !== 'idle' ? h('span', { class: 'wait' }, 'Esc to cancel') : !humanCanAct() && !state.over ? h('span', { class: 'wait' }, 'Waiting') : null);
  }

  function renderGameOver() {
    const won = state.winner === HUMAN;
    const draw = state.winner === 'draw';
    const title = draw ? 'Draw' : spectate ? `${state.players[state.winner].name} wins` : won ? 'Victory!' : 'Defeat';
    const cls = draw ? 'draw' : (won || spectate) ? 'won' : '';
    const forfeitLine = state.log.length && /forfeits\.$/.test(state.log[state.log.length - 1].text) ? state.log[state.log.length - 1].text : null;
    return h('div', { class: 'overlay' },
      h('div', { class: `dialog ${cls}`, role: 'dialog', 'aria-modal': 'true' },
        h('h2', null, title),
        h('p', { class: 'muted' }, online
          ? `${state.players[HUMAN].name} (${me.name}) vs ${state.players[OPP].name} (${them.name}) · ${state.turn} turns`
          : `${me.name} vs ${them.name} · ${state.turn} turns`),
        online && forfeitLine ? h('p', { class: 'muted' }, forfeitLine) : null,
        ui.rewards?.render ? ui.rewards.render() : null,
        h('div', { class: 'dialog-actions' },
          online ? renderOnlineRematch() : h('button', { class: 'btn primary', onclick: () => { teardown(); onRematch(); } }, 'Rematch'),
          h('button', { class: 'btn ghost', onclick: exit }, online ? 'Back to lobby' : 'Main menu'))));
  }

  // Online rematch: both players have to ask; the server then starts a new match in the same room.
  function renderOnlineRematch() {
    if (ui.oppStatus === 'left') return h('button', { class: 'btn primary', disabled: true }, 'Opponent left');
    if (ui.rematch.includes(HUMAN)) return h('button', { class: 'btn primary', disabled: true }, 'Waiting for opponent…');
    const asked = ui.rematch.includes(OPP);
    return h('button', { class: `btn primary${asked ? ' pulse' : ''}`, onclick: () => online.send({ t: 'rematch' }) }, asked ? 'Accept rematch' : 'Rematch');
  }

  // The human's own cards show their premium version when the player owns one (a cosmetic only).
  function isPremium(def, owner) {
    return !spectate && owner === HUMAN && cos.premium.has(def.cardId);
  }

  setClock(online?.clock);
  render();
  if (!online) pump();
  return { close: teardown };
}
