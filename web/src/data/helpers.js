// Compact constructors for card data. The objects they build follow the original Unity JSON schema
// (cardId, displayName, type, cost, baseAttack, baseHealth, speedWindow, keywords, effects) with a few
// additions: effect.trigger, effect.token, effect.attack/health, effect.nitroCost and card.isNew.

export const M = (cardId, displayName, cost, baseAttack, baseHealth, keywords = [], effects = [], extra = {}) => ({
  cardId, displayName, type: 'Monster', cost, baseAttack, baseHealth,
  speedWindow: 'None', keywords, effects, ...extra,
});

export const S = (cardId, displayName, cost, effects, extra = {}) => ({
  cardId, displayName, type: 'Spell', cost, baseAttack: 0, baseHealth: 0,
  speedWindow: 'None', keywords: [], effects, ...extra,
});

// Effect: fx('DealDamage', 2, 'EnemyMonster', { cond: 'CardsPlayed1', trigger: 'death' })
export const fx = (effectType, amount = 0, targeting = 'None', opts = {}) => ({ effectType, amount, targeting, ...opts });

export const QUICK = { speedWindow: 'Quick' };
export const NEW = { isNew: true };
export const QUICK_NEW = { speedWindow: 'Quick', isNew: true };
