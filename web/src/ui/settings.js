// The Settings dialog: sound volumes, and replaying the tutorial or the first-time tips.

import { h } from './dom.js';
import { audioSettings, setAudio, sfx } from './audio.js';
import { resetOnboarding } from './tutorial.js';

export function settingsDialog({ onTutorial }) {
  const a = audioSettings();
  const close = () => overlay.remove();
  const slider = (key, label) => {
    const out = h('output', null, `${Math.round(a[key] * 100)}%`);
    const input = h('input', { type: 'range', min: '0', max: '100', step: '5', value: String(Math.round(a[key] * 100)), 'aria-label': label });
    input.addEventListener('input', () => {
      setAudio({ [key]: Number(input.value) / 100 });
      out.textContent = `${input.value}%`;
    });
    input.addEventListener('change', () => sfx(key === 'music' ? 'coin' : 'click'));
    return h('label', { class: 'setting-row' }, h('span', null, label), input, out);
  };
  const mute = h('input', { type: 'checkbox', checked: a.muted ? '' : null });
  mute.addEventListener('change', () => setAudio({ muted: mute.checked }));
  const tipsBtn = h('button', { class: 'btn ghost small', onclick: () => { resetOnboarding(); tipsBtn.textContent = 'Tips will show again'; tipsBtn.disabled = true; } }, 'Show tips again');

  const overlay = h('div', { class: 'overlay', onclick: e => { if (e.target === overlay) close(); } },
    h('div', { class: 'dialog settings-dialog', role: 'dialog', 'aria-label': 'Settings' },
      h('h2', null, 'Settings'),
      h('section', null,
        h('h3', null, 'Sound'),
        slider('master', 'Master'),
        slider('music', 'Music'),
        slider('sfx', 'Effects'),
        h('label', { class: 'setting-row check' }, mute, h('span', null, 'Mute everything'))),
      h('section', null,
        h('h3', null, 'Learning'),
        h('div', { class: 'setting-actions' },
          h('button', { class: 'btn ghost small', onclick: () => { close(); onTutorial(); } }, 'Play the tutorial'),
          tipsBtn)),
      h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', onclick: close }, 'Done'))));
  document.addEventListener('keydown', function esc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', esc); }
  });
  document.body.append(overlay);
}
