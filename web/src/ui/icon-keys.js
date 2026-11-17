// The Art Studio slot (assets/img/ui/<key>.webp) behind each painted icon the UI shows. Plain data, so
// the Art Studio (tools/art-studio/slots.js) and the tests can import it without a page.

const kebab = s => s.replace(/([a-z])([A-Z])/g, '$1-$2').replace(/\s+/g, '-').toLowerCase();

// House Rules are also rules terms under their own names; those share the rule's icon.
const RULE_TERMS = { 'Draft Night': 'DraftNight', 'Balance Patch': 'BalancePatch', 'Hand Size Errata': 'HandSize' };
// Terms that are another name for a keyword share its icon.
const SAME_AS = { Suppress: 'Suppression' };

export const ruleIconKey = id => `rule-${kebab(id)}`;
export const keywordIconKey = k => (RULE_TERMS[k] ? ruleIconKey(RULE_TERMS[k]) : `kw-${kebab(SAME_AS[k] ?? k)}`);
export const triggerIconKey = trigger => `trig-${kebab(trigger)}`;

// The rules-line openers that get an icon ("Death: ...").
export const TRIGGERS = ['Play', 'Death', 'Turn start', 'Turn end'];

// Icons for the rest of the UI: { name: ui/icon-<name> }.
export const UI_ICONS = [
  'lock', 'key', 'account', 'trophy', 'streak', 'tip', 'gift', 'quick-match', 'open-room',
  'cosmetic', 'premium-card', 'holo-card', 'cards',
];
export const uiIconKey = name => `icon-${name}`;
