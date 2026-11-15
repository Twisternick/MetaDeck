// The tutorial: a short scripted match (RPG vs Sports, enemy starting on 8 HP) that teaches the basics
// one step at a time — playing a monster, ending the turn, Guard, targeted spells, attacking, keywords,
// keeping Bandwidth for a Quick response, and winning. The script is in tutorial-script.js; this file
// draws the coaching over the match screen and pays the reward.
// Finishing it once gives a Mixed pack (finishTutorial in data/economy.js).
//
// Also here: one-time tips for the first visit to a screen (tip()), remembered per browser.

import { h, storage } from './dom.js';
import { startMatch } from './match.js';
import { act } from './profile.js';
import { rewardLabel, TUTORIAL_REWARD } from '../data/economy.js';
import { ME, AI, ENEMY_HP, MY_DECK, AI_DECK, STEPS, enemyMove } from './tutorial-script.js';
import { track } from './telemetry.js';
import { sfx } from './audio.js';

// Start the tutorial. onExit goes back to the menu.
export function tutorial(root, { onExit }) {
  let step = 0;
  let started = false;
  let rewards = null;
  track('match_start', { mode: 'tutorial', deck: 'RPG' });

  const advance = s => {
    while (step < STEPS.length && STEPS[step].done?.(s)) {
      step++;
      track('tutorial', { step });
      sfx('unlock', { volume: 0.5 });
    }
  };
  // A started step held back by `when` (the game hasn't reached it: the enemy is still moving).
  const held = s => started && !!STEPS[step]?.when && !STEPS[step].when(s);

  const script = {
    setup(s) { s.players[AI].hp = ENEMY_HP; },
    ai: enemyMove,
    allow(action, s) {
      const st = STEPS[step];
      if (!started) return 'Press “Let’s go” to start.';
      if (!st?.allow) return null;
      return st.allow(action, s) ? null : st.refuse ?? 'Follow the tip at the top for now.';
    },
    after(s, view, { refresh }) {
      advance(s);
      view.querySelectorAll('.coach-glow').forEach(el => el.classList.remove('coach-glow'));
      view.querySelector('.coach')?.remove();
      if (s.over) return;
      const st = STEPS[step];
      if (!st) return;
      const waiting = held(s);
      if (!waiting) {
        for (const t of st.glow?.(s) ?? []) {
          const el = !t ? null
            : typeof t === 'object' ? view.querySelector(`[data-uid="${t.uid}"]`)
            : t.startsWith('hero:') ? view.querySelector(`[data-pid="${t.slice(5)}"]`)
            : view.querySelector(t);
          el?.classList.add('coach-glow');
        }
      }
      const text = h('p');
      text.innerHTML = waiting ? 'The enemy is taking its turn…' : st.text; // the step texts are fixed strings above
      view.append(h('div', { class: `coach${waiting ? ' waiting' : ''}`, role: 'status', 'aria-live': 'polite' },
        h('div', { class: 'coach-top' },
          h('span', { class: 'coach-step' }, `Tutorial · ${Math.min(step + 1, STEPS.length)}/${STEPS.length}`),
          h('button', { class: 'coach-skip', onclick: () => { track('tutorial', { step: -1 }); markSeen(); handle.close?.(); onExit(); } }, 'Skip')),
        text,
        st.button && !started ? h('button', { class: 'btn primary small', onclick: () => { started = true; step = 1; refresh(); } }, st.button) : null));
    },
  };

  const handle = startMatch(root, {
    myDeck: 'RPG', oppDeck: 'Sports', myCards: MY_DECK, oppCards: AI_DECK,
    deal: { seed: 1, firstPlayer: ME }, script, onExit,
    onRematch: () => tutorial(root, { onExit }),
    shuffle: false,
    onResult: ({ won }) => {
      markSeen();
      if (!won) return null;
      const holder = h('div', { class: 'rewards-holder' }, h('p', { class: 'muted rewards-wait' }, 'Tutorial complete!'));
      act('finishTutorial').then(r => {
        holder.replaceChildren(
          h('p', { class: 'tutorial-done' }, 'Tutorial complete! You know the basics.'),
          r.ok ? h('p', { class: 'reward-line' }, `🎁 ${rewardLabel(r.reward ?? TUTORIAL_REWARD)} — open it from Collection.`) : null,
          h('p', { class: 'muted' }, 'Your next few matches against the AI are on easy. Every deck has its own tricks: try them all.'));
      });
      return { render: () => holder };
    },
  });
  return handle;
}

// ---------------------------------------------------------------- remembering

const PREFS = 'metadeck.onboarding';
const seen = () => storage.get(PREFS, { tutorial: false, tips: [] });
export const tutorialSeen = () => seen().tutorial;
export const dismissTutorial = () => markSeen();
function markSeen() { storage.set(PREFS, { ...seen(), tutorial: true }); }
export const tipsEnabled = () => seen().tipsEnabled !== false;
export function setTipsEnabled(enabled) {
  storage.set(PREFS, { ...seen(), tipsEnabled: enabled });
  if (!enabled) document.querySelector('.tip-card')?.remove();
}
export function resetTips() { storage.set(PREFS, { ...seen(), tips: [], tipsEnabled: true }); }

// One-time tips: shown the first time `key` comes up in this browser, then never again.
export function tip(key, text) {
  const s = seen();
  if (s.tipsEnabled === false || s.tips.includes(key)) return;
  storage.set(PREFS, { ...s, tips: [...s.tips, key] });
  document.querySelector('.tip-card')?.remove();
  const card = h('div', { class: 'tip-card', role: 'status' },
    h('span', { class: 'tip-icon', 'aria-hidden': 'true' }, '💡'),
    h('p', null, text),
    h('button', { class: 'btn ghost small', onclick: () => card.remove() }, 'Got it'));
  document.body.append(card);
  setTimeout(() => card.remove(), 14_000);
}
