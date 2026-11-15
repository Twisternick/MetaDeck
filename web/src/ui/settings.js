// Shared settings for the menu and match HUD.
import { h } from './dom.js';
import { audioSettings, setAudio, sfx } from './audio.js';
import { resetTips, tipsEnabled, setTipsEnabled } from './tutorial.js';

export function settingsButton({ onTutorial } = {}) {
  return h('button', { class: 'btn ghost small', 'aria-haspopup': 'dialog',
    onclick: () => openSettings(onTutorial) }, 'Settings');
}

function openSettings(onTutorial) {
  const audio = audioSettings();
  const mute = h('input', { type: 'checkbox', checked: audio.muted,
    onchange: () => setAudio({ muted: mute.checked }) });
  const slider = (key, label) => {
    const value = Math.round(audio[key] * 100);
    const out = h('output', null, value + '%');
    const input = h('input', { type: 'range', min: 0, max: 100, step: 1, value,
      'aria-label': label, 'aria-valuetext': value + '%' });
    input.addEventListener('input', () => {
      const changes = { [key]: Number(input.value) / 100 };
      if (key === 'master') {
        mute.checked = false;
        changes.muted = false;
      }
      setAudio(changes);
      out.textContent = input.value + '%';
      input.setAttribute('aria-valuetext', out.textContent);
    });
    if (key !== 'music') input.addEventListener('change', () => sfx('click'));
    return h('label', { class: 'setting-row' }, h('span', null, label), input, out);
  };
  const tips = h('input', { type: 'checkbox', checked: tipsEnabled(),
    onchange: () => setTipsEnabled(tips.checked) });
  const reset = h('button', { class: 'btn ghost small', onclick: () => {
    resetTips();
    tips.checked = true;
    reset.textContent = 'Tips reset';
  } }, 'Reset first-time tips');
  const dialog = h('dialog', { class: 'dialog settings-dialog', 'aria-labelledby': 'settings-title',
    onkeydown: e => e.stopPropagation(), onclose: () => dialog.remove() },
    h('h2', { id: 'settings-title' }, 'Settings'),
    h('section', null, h('h3', null, 'Sound'),
      slider('master', 'Master volume'), slider('music', 'Music'), slider('sfx', 'Sound effects'),
      h('label', { class: 'setting-row check' }, mute, 'Mute all sound')),
    h('section', null, h('h3', null, 'Learning'),
      h('label', { class: 'setting-row check' }, tips, 'Show first-time tips'),
      h('div', { class: 'setting-actions' }, reset, onTutorial && h('button', { class: 'btn ghost small',
        onclick: () => { dialog.close(); onTutorial(); } }, 'Play the tutorial'))),
    h('div', { class: 'dialog-actions' }, h('button', { class: 'btn primary', onclick: () => dialog.close() }, 'Done')));
  document.body.append(dialog);
  dialog.showModal();
}
