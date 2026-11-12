// Season & quests: today's quests, the daily Gold counters, archetype levels (which unlock the other
// starter decks) and the season track with its free and premium rewards.

import { h } from './dom.js';
import { removeFx, sparkle, confetti, motionOK } from './fx.js';
import { profile, act, walletBar } from './profile.js';
import { toast } from './packs.js';
import {
  questText, canReroll, seasonName, seasonTier, SEASON_TIERS, TIER_XP, seasonReward, canClaim,
  rewardLabel, cosmetic, SEASON_PASS_GEMS, DAILY_WIN_GOLD_CAP, FIRST_WIN_GOLD, WIN_GOLD,
  archInfo, archLevel, ARCH_LEVEL_XP, ARCH_MAX_LEVEL, STARTER_UNLOCKS, QUEST_XP,
} from '../data/economy.js';
import { DECKS, starterDecks } from '../data/index.js';

const REWARD_ICONS = { gold: '🪙', gems: '💎', dust: '✨', pack: '🎴', cosmetic: '🎨', premiumCard: '🌟', cards: '📦' };

export function season(root, { onBack, nav }) {
  removeFx();
  const body = h('div', { class: 'season-body' });
  let scrolled = false;

  const render = () => {
    const p = profile();
    body.replaceChildren(questsSection(), trackSection(), levelsSection());
    if (!scrolled) {
      scrolled = true;
      // Scroll the track (not the page) so the next tier is in view.
      requestAnimationFrame(() => {
        const strip = body.querySelector('.track-scroll');
        const next = body.querySelector('.tier.current');
        if (strip && next) strip.scrollLeft = next.offsetLeft - strip.offsetLeft - strip.clientWidth / 2 + next.offsetWidth / 2;
      });
    }
    return p;
  };

  function questsSection() {
    const p = profile();
    const reroll = canReroll(p);
    const days = daysLeft(p.season.id);
    return h('section', { class: 'quests rise' },
      h('h2', null, 'Daily quests'),
      h('p', { class: 'muted' }, `A new quest arrives every day (you can hold 3). Each one also gives ${QUEST_XP} season XP. You can swap one quest a day.`),
      h('div', { class: 'quest-grid' },
        p.quests.length ? p.quests.map((q, i) => h('div', { class: 'quest rise', style: { '--i': i } },
          h('div', { class: 'quest-text' }, questText(q)),
          h('div', { class: 'meter' }, h('i', { style: { '--pct': `${(q.progress / q.goal) * 100}%` } })),
          h('div', { class: 'quest-foot' },
            h('span', null, `${q.progress} / ${q.goal}`),
            h('span', { class: 'quest-reward' }, `🪙 ${q.gold}`),
            reroll ? h('button', { class: 'btn ghost small', onclick: async () => { const r = await act('rerollQuest', { id: q.id }); if (!r.ok) toast(r.reason, 'bad'); render(); } }, 'Swap') : null)))
          : h('p', { class: 'muted' }, 'All done for today. Come back tomorrow for a new quest.')),
      h('div', { class: 'daily' },
        h('span', { class: `daily-pill${p.daily.firstWin ? ' done' : ''}` }, p.daily.firstWin ? '✔ First win bonus claimed' : `First win of the day: +${FIRST_WIN_GOLD} Gold`),
        h('span', { class: 'daily-pill' }, `Win Gold today: ${p.daily.winGold} / ${DAILY_WIN_GOLD_CAP} (${WIN_GOLD} per win)`),
        h('span', { class: 'daily-pill' }, `${days} day${days === 1 ? '' : 's'} left in the season`)));
  }

  function trackSection() {
    const p = profile();
    const tier = seasonTier(p);
    const into = tier >= SEASON_TIERS ? TIER_XP : p.season.xp % TIER_XP;
    const claimable = [];
    for (let t = 1; t <= tier; t++) for (const track of ['free', 'premium']) if (canClaim(p, track, t)) claimable.push([track, t]);

    const claim = async (track, t, el) => {
      const rect = el?.getBoundingClientRect();
      const res = await act('claimSeason', { track, tier: t });
      if (!res.ok) { toast(res.reason, 'bad'); return render(); }
      const got = res.reward;
      toast(`${REWARD_ICONS[got.type] ?? ''} ${rewardLabel(got)}`);
      if (rect && motionOK()) sparkle(rect, track === 'premium' ? '#ffc53d' : '#22d3ee', 16);
      render();
    };
    const claimAll = async () => {
      const res = await act('claimAllSeason');
      if (!res.ok) { toast(res.reason, 'bad'); return render(); }
      const got = res.rewards;
      toast(`Claimed ${got.length} reward${got.length === 1 ? '' : 's'}`);
      if (motionOK()) confetti();
      render();
    };

    const cell = (track, t) => {
      const r = seasonReward(track, t);
      const claimed = p.season.claimed[track].includes(t);
      const ready = canClaim(p, track, t);
      const locked = track === 'premium' && !p.season.premium;
      return h('div', {
        class: `reward-cell ${track}${claimed ? ' claimed' : ''}${ready ? ' ready' : ''}${locked ? ' locked' : ''}${r.type === 'cosmetic' ? ' special' : ''}`,
        title: rewardLabel(r), role: ready ? 'button' : null, tabindex: ready ? '0' : null,
        onclick: ready ? e => claim(track, t, e.currentTarget) : null,
        onkeydown: ready ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); claim(track, t, e.currentTarget); } } : null,
      },
        h('span', { class: 'reward-icon', 'aria-hidden': 'true' }, REWARD_ICONS[r.type]),
        h('span', { class: 'reward-label' }, r.type === 'cosmetic' ? cosmetic(r.id).name : rewardLabel(r)),
        claimed ? h('span', { class: 'reward-state' }, '✔') : locked ? h('span', { class: 'reward-state' }, '🔒') : null);
    };

    return h('section', { class: 'track rise', style: { '--i': 1 } },
      h('div', { class: 'track-head' },
        h('div', null,
          h('div', { class: 'pass-kicker' }, seasonName(p.season.id)),
          h('h2', null, `Tier ${tier} / ${SEASON_TIERS}`),
          h('div', { class: 'meter big' }, h('i', { style: { '--pct': `${(into / TIER_XP) * 100}%` } })),
          h('p', { class: 'muted' }, tier >= SEASON_TIERS ? 'Season complete!' : `${into} / ${TIER_XP} XP to tier ${tier + 1} · a win is worth 100 XP, a loss 50`)),
        h('div', { class: 'track-actions' },
          claimable.length ? h('button', { class: 'btn primary', onclick: claimAll }, `Claim all (${claimable.length})`) : null,
          p.season.premium ? h('span', { class: 'premium-badge' }, '★ Premium track active')
            : h('button', {
              class: 'btn primary online', disabled: p.gems < SEASON_PASS_GEMS || null,
              title: p.gems < SEASON_PASS_GEMS ? 'Get Gems in the shop' : null,
              onclick: async () => { const r = await act('buySeasonPass'); if (!r.ok) return toast(r.reason, 'bad'); toast('Premium track unlocked!'); if (motionOK()) confetti(); render(); },
            }, `Unlock premium · 💎 ${SEASON_PASS_GEMS}`),
          !p.season.premium && p.gems < SEASON_PASS_GEMS && nav.shop ? h('button', { class: 'btn ghost small', onclick: nav.shop }, 'Get Gems') : null)),
      h('div', { class: 'track-rows' },
        h('div', { class: 'track-labels' }, h('span', null, 'Free'), h('span', { class: 'gold-text' }, 'Premium')),
        h('div', { class: 'track-scroll' },
          Array.from({ length: SEASON_TIERS }, (_, k) => {
            const t = k + 1;
            return h('div', { class: `tier${t <= tier ? ' reached' : ''}${t === tier + 1 ? ' current' : ''}` },
              h('div', { class: 'tier-num' }, t),
              cell('free', t), cell('premium', t));
          }))));
  }

  function levelsSection() {
    const p = profile();
    return h('section', { class: 'levels rise', style: { '--i': 2 } },
      h('h2', null, 'Archetype levels'),
      h('p', { class: 'muted' }, `Every game with an archetype gives it XP (3 for a win, 1 for a loss). Each level gives one of its packs; level ${Object.keys(STARTER_UNLOCKS)[0]} and level ${Object.keys(STARTER_UNLOCKS)[1]} unlock its other starter decks.`),
      h('div', { class: 'level-grid' }, DECKS.map((d, i) => {
        const a = archInfo(p, d.id);
        const lv = archLevel(a.xp);
        const into = lv >= ARCH_MAX_LEVEL ? ARCH_LEVEL_XP : a.xp % ARCH_LEVEL_XP;
        const nextUnlock = Object.keys(STARTER_UNLOCKS).map(Number).find(l => l > lv);
        return h('div', { class: 'level-card rise', style: { '--deck': d.color, '--i': i } },
          h('div', { class: 'level-head' }, h('span', { class: 'chip-emblem' }, d.icon), h('b', null, d.name), h('span', { class: 'level-num' }, `Lv ${lv}`)),
          h('div', { class: 'meter' }, h('i', { style: { '--pct': `${(into / ARCH_LEVEL_XP) * 100}%` } })),
          h('div', { class: 'muted small' }, nextUnlock
            ? `Level ${nextUnlock}: ${starterDecks(d.id)[STARTER_UNLOCKS[nextUnlock]].name}`
            : lv >= ARCH_MAX_LEVEL ? 'Max level' : 'All starters unlocked'),
          h('div', { class: 'muted small' }, `${a.wins} wins · ${a.games} games`));
      })));
  }

  act('refresh'); // rolls in today's quest (and, signed in, fetches the latest profile)
  root.replaceChildren(h('main', { class: 'season' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: onBack }, '← Menu'),
      h('h1', null, 'Season & quests'),
      walletBar({ nav: { shop: nav.shop, collection: nav.collection, account: nav.account } })),
    body));
  render();
}

function daysLeft(seasonId) {
  const [y, m] = seasonId.split('-').map(Number);
  return Math.max(1, Math.ceil((new Date(y, m, 1) - new Date()) / 86400000));
}
