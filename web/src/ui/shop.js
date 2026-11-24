// Shop: packs for Gold or Gems, cosmetics and the premium season track for Gems, and Gem bundles.
// With payments set up (server/payments.mjs), Gem bundles are bought through Paddle by signed-in
// adults. Without them, a local or test host can credit a bundle as a clearly labelled test purchase
// so the flow can be tried end to end; anywhere else the bundles say they're coming soon.

import { h, storage, rectOf } from './dom.js';
import { removeFx, sparkle, motionOK, deckEmblem, currency } from './fx.js';
import { profile, act, walletBar, testPurchasesAllowed } from './profile.js';
import { openPacks, packArt, packName, rarityColor, toast } from './packs.js';
import { cosmeticPreview } from './collection.js';
import {
  PACK_GOLD, PACK_GEMS, PACK_BUNDLE, PACK_SIZE, PACK_ODDS, PREMIUM_CHANCE, HOLO_CHANCE, LEGENDARY_PITY, RARITY, GEM_BUNDLES,
  SEASON_PASS_GEMS, COSMETICS, ownsCosmetic, seasonName,
} from '../data/economy.js';
import { DECKS } from '../data/index.js';
import { tip } from './tutorial.js';
import { shopConfig, cachedShopConfig, cantBuy, purchaseDialog, paidPacksBlocked } from './payments.js';

const money = n => `$${n.toFixed(2)}`;

export function shop(root, { onBack, nav }) {
  tip('shop', "Packs cost 100 Gold. You earn Gold from wins, the first win of each day and daily quests.");
  removeFx();
  const prefs = storage.get('metadeck.shop', { pack: DECKS[0].id });
  const body = h('div', { class: 'shop-body' });

  const render = () => {
    storage.set('metadeck.shop', prefs);
    const p = profile();
    body.replaceChildren(...[
      p.season.premium ? null : passBanner(),
      packsSection(),
      h('section', { class: 'rise', style: { '--i': 3 } },
        h('h2', null, 'Cosmetics'),
        h('p', { class: 'muted' }, 'Looks only: nothing here changes how a card plays.'),
        h('div', { class: 'cos-grid' }, COSMETICS.filter(c => c.gems).map((c, i) => cosmeticOffer(c, i)))),
      gemsSection(),
    ].filter(Boolean));
  };

  // Every purchase is an economy operation (applied by the server when signed in).
  const buy = async (op, args, msg, el) => {
    if (el) el.disabled = true;
    const res = await act(op, args);
    if (el) el.disabled = false;
    if (!res.ok) { toast(res.reason, 'bad'); return false; }
    toast(msg(res));
    if (el && motionOK()) sparkle(rectOf(el), '#ffc53d', 18);
    render();
    return true;
  };

  function passBanner() {
    const p = profile();
    return h('section', { class: 'pass-banner rise' },
      h('div', null,
        h('div', { class: 'pass-kicker' }, seasonName(p.season.id)),
        h('h2', null, 'Premium season track'),
        h('p', null, 'Unlocks a second reward on every tier: exclusive card backs and arenas, premium cards, extra packs and Gems back. Tiers you already reached pay out straight away.')),
      h('button', {
        class: 'btn primary big', disabled: p.gems < SEASON_PASS_GEMS || null,
        onclick: e => buy('buySeasonPass', {}, () => 'Premium track unlocked!', e.currentTarget),
      }, 'Unlock · ', currency('gems'), ` ${SEASON_PASS_GEMS}`));
  }

  function packsSection() {
    const p = profile();
    const kind = prefs.pack;
    const deck = DECKS.find(d => d.id === kind);
    const pick = (id, label, emblem, color) => h('button', {
      class: `chip${kind === id ? ' selected' : ''}`, style: { '--deck': color }, onclick: () => { prefs.pack = id; render(); },
    }, deckEmblem(emblem, 'chip-emblem'), label);
    const purchase = (cur, count, label, price) => h('button', {
      class: `btn ${cur === 'gold' ? 'primary' : 'primary online'}`, disabled: p[cur] < price || (cur === 'gems' && paidPacksBlocked()) || null,
      title: cur === 'gems' && paidPacksBlocked() ? 'Packs can’t be bought with Gems in your country. Gold packs are available.' : null,
      onclick: e => buy('buyPack', { kind, currency: cur, count }, () => `${count > 1 ? `${count} packs` : 'Pack'} added`, e.currentTarget),
    }, label, h('span', { class: 'btn-cost' }, currency(cur), ` ${price}`));
    const unopened = p.packs[kind] ?? 0;
    return h('section', { class: 'rise', style: { '--i': 1 } },
      h('h2', null, 'Card packs'),
      h('nav', { class: 'chips' }, DECKS.map(d => pick(d.id, d.name, d, d.color)), pick('any', 'Mixed', null, '#a78bfa')),
      h('div', { class: 'pack-offer', 'data-deck': deck?.id, style: { '--deck': deck?.color ?? '#a78bfa' } },
        packArt(kind, 'idle'),
        h('div', { class: 'pack-offer-text' },
          h('h3', null, packName(kind)),
          h('p', { class: 'muted' }, kind === 'any'
            ? `${PACK_SIZE} cards from any archetype.`
            : `${PACK_SIZE} ${deck.name} cards. At least one Rare or better in every pack.`),
          h('div', { class: 'pack-buttons' },
            purchase('gold', 1, 'Buy 1', PACK_GOLD),
            purchase('gems', 1, 'Buy 1', PACK_GEMS),
            purchase('gems', PACK_BUNDLE.packs, `Buy ${PACK_BUNDLE.packs}`, PACK_BUNDLE.gems)),
          unopened ? h('button', { class: 'btn ghost', onclick: () => openPacks(kind, render) }, `Open now (${unopened})`) : null,
          oddsDetails())));
  }

  // Pack odds, published in full.
  function oddsDetails() {
    return h('details', { class: 'odds' },
      h('summary', null, 'Pack odds'),
      h('ul', null,
        PACK_ODDS.map(o => h('li', null, h('span', { class: 'odds-gem', style: { '--glow': rarityColor(o.rarity) } }),
          `${RARITY[o.rarity].name}: ${(o.chance * 100).toFixed(1)}% per card`)),
        h('li', null, `Every pack has at least one Rare or better.`),
        h('li', null, `Each card has a ${(PREMIUM_CHANCE * 100).toFixed(0)}% chance to be premium (animated) and a ${(HOLO_CHANCE * 100).toFixed(0)}% chance to be a hologram.`),
        h('li', null, `You get a Legendary at least once every ${LEGENDARY_PITY} packs.`),
        h('li', null, 'Duplicate protection: you never get a copy of a card you already own the maximum of while other cards of that rarity are missing. If you own them all, the extra copy turns into Dust.')));
  }

  function cosmeticOffer(c, i) {
    const p = profile();
    const have = ownsCosmetic(p, c.id);
    return h('div', { class: `cos-tile rise${have ? ' equipped' : ''}`, style: { '--i': i } },
      cosmeticPreview(c),
      h('div', { class: 'cos-name' }, c.name, h('span', { class: 'cos-kind' }, c.kind === 'back' ? 'Card back' : 'Arena')),
      h('div', { class: 'cos-blurb muted' }, c.blurb),
      have ? h('span', { class: 'cos-how' }, '✔ Owned')
        : p.gems < c.gems
          // Short on Gems: say so and point at the Gems section rather than showing a dead button.
          ? h('button', {
            class: 'btn ghost small', title: `You have ${p.gems} Gems`,
            onclick: () => {
              toast(`You need ${c.gems - p.gems} more Gems for ${c.name}.`, 'bad');
              document.querySelector('.gem-grid')?.scrollIntoView({ behavior: motionOK() ? 'smooth' : 'auto', block: 'center' });
            },
          }, currency('gems'), ` ${c.gems} · need ${c.gems - p.gems} more`)
          : h('button', {
            class: 'btn primary online small',
            onclick: e => buy('buyCosmetic', { id: c.id }, () => `${c.name} unlocked. Equip it in your Collection.`, e.currentTarget),
          }, currency('gems'), ` ${c.gems}`));
  }

  function gemsSection() {
    const live = cachedShopConfig()?.enabled ? cachedShopConfig() : null;
    if (live) return liveGems(live);
    const testing = testPurchasesAllowed();
    return h('section', { class: 'rise', style: { '--i': 4 } },
      h('h2', null, 'Gems'),
      h('p', { class: 'muted' }, testing
        ? 'Payments are not connected yet. On this local server, a bundle is credited as a test purchase: nothing is charged.'
        : 'Gem purchases are coming soon.'),
      h('div', { class: 'gem-grid' }, GEM_BUNDLES.map((b, i) => h('div', { class: 'gem-tile rise', style: { '--i': i, '--size': i } },
        h('div', { class: 'gem-pile', 'aria-hidden': 'true' }, Array.from({ length: Math.min(5, i + 1) }, () => currency('gems'))),
        h('div', { class: 'gem-amount' }, b.gems.toLocaleString(), ' Gems'),
        b.bonus ? h('div', { class: 'gem-bonus' }, b.bonus) : null,
        h('button', {
          class: 'btn primary small', disabled: testing ? null : true,
          onclick: e => {
            if (!confirm(`Test purchase: add ${b.gems} Gems (listed at ${money(b.price)}). Nothing is charged. Continue?`)) return;
            buy('testPurchase', { bundle: b.id }, () => `+${b.gems} Gems (test purchase)`, e.currentTarget);
          },
        }, testing ? `${money(b.price)} · test` : money(b.price))))));
  }

  // Real Gem bundles, through Paddle.
  function liveGems(cfg) {
    const why = cantBuy();
    const p = profile();
    return h('section', { class: 'rise', style: { '--i': 4 } },
      h('h2', null, 'Gems'),
      cfg.sandbox ? h('p', { class: 'lobby-error' }, 'Sandbox mode: use Paddle’s test cards. Nothing real is charged.') : null,
      p.gemDebt > 0 ? h('p', { class: 'lobby-error' }, `A refund took back ${p.gemDebt} Gems you had already spent. Gem spending is paused until your balance is above zero again.`) : null,
      h('p', { class: 'muted' }, why ?? 'Gems buy packs, cosmetics and the premium season track. Prices in US dollars; the checkout shows your local price and tax.'),
      h('div', { class: 'gem-grid' }, GEM_BUNDLES.filter(b => cfg.bundles.includes(b.id)).map((b, i) => h('div', { class: 'gem-tile rise', style: { '--i': i, '--size': i } },
        h('div', { class: 'gem-pile', 'aria-hidden': 'true' }, Array.from({ length: Math.min(5, i + 1) }, () => currency('gems'))),
        h('div', { class: 'gem-amount' }, b.gems.toLocaleString(), ' Gems'),
        b.bonus ? h('div', { class: 'gem-bonus' }, b.bonus) : null,
        h('button', { class: 'btn primary small', disabled: why ? true : null, onclick: () => purchaseDialog(b, money(b.price)) }, money(b.price))))),
      h('p', { class: 'muted small' }, 'Gem purchases are handled by Paddle, our merchant of record. ',
        h('a', { href: 'legal/refunds.html', target: '_blank', rel: 'noopener' }, 'Refund Policy')));
  }

  root.replaceChildren(h('main', { class: 'shop' },
    h('header', { class: 'page-head' },
      h('button', { class: 'btn ghost small', onclick: onBack }, '← Menu'),
      h('h1', null, 'Shop'),
      walletBar({ nav: { collection: nav.collection, season: nav.season, account: nav.account } })),
    body));
  render();
  if (!cachedShopConfig()) shopConfig().then(c => { if (c.enabled || c.country) render(); });
}
