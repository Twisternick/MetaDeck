using System.Collections.Generic;
using MetaDeck.Data;
using MetaDeck.Rules;

namespace MetaDeck.Core
{
    public sealed class CardInstance
    {
        public string InstanceId { get; } // unique per match (guid string recommended)
        public CardDefinition Def { get; }
        public PlayerId Owner { get; }

        public Zone Zone { get; set; }

        // Runtime cost modifiers if needed later
        public int CurrentCost { get; set; }

        // Monster runtime stats
        public int Attack { get; set; }
        public int Health { get; set; }

        public int GetMaxHealth()
        {
            int baseHealth = Def.baseHealth;
            for (int i = 0; i < StatModifiers.Count; i++)
                baseHealth += StatModifiers[i].HealthDelta;
            return baseHealth;
        }

        public int GetAttack()
        {
            int baseAttack = Attack;
            for (int i = 0; i < StatModifiers.Count; i++)
                baseAttack += StatModifiers[i].AttackDelta;
            return baseAttack;
        }

        public int GetHealth()
        {
            int currentHealth = Health;
            for (int i = 0; i < StatModifiers.Count; i++)
                currentHealth += StatModifiers[i].HealthDelta;
            return currentHealth;
        }
        public bool IsDestroyed => Def.type == CardType.Monster && GetHealth() <= 0;

        public HashSet<Keyword> Keywords { get; }

        // Temporary keywords
        private readonly HashSet<Keyword> _keywordsThisTurn = new();
        private readonly HashSet<Keyword> _keywordsThisCombat = new();

        // Counters (Nitro/XP/Momentum)
        public Dictionary<string, int> Counters { get; } = new();

        public List<StatModifier> StatModifiers { get; } = new();

        public int SummonedTurn { get; set; } = -1; // for tracking summon sickness, etc.

        public CardInstance(string instanceId, CardDefinition def, PlayerId owner)
        {
            InstanceId = instanceId;
            Def = def;
            Owner = owner;

            CurrentCost = def.cost;

            Attack = def.baseAttack;
            Health = def.baseHealth;

            Keywords = new HashSet<Keyword>();
            if (def.keywords != null)
                foreach (var k in def.keywords) Keywords.Add(k);
        }

        public bool HasKeyword(Keyword k)
        {
            if (k == Keyword.None) return false;
            return Keywords.Contains(k) || _keywordsThisTurn.Contains(k) || _keywordsThisCombat.Contains(k);
        }

        public void GrantKeywordThisTurn(Keyword k)
        {
            if (k == Keyword.None) return;
            if (Keywords.Contains(k)) return;
            _keywordsThisTurn.Add(k);
        }

        public void GrantKeywordThisCombat(Keyword k)
        {
            if (k == Keyword.None) return;
            if (Keywords.Contains(k)) return;
            _keywordsThisCombat.Add(k);
        }

        public void RemoveKeywordThisTurn(Keyword k)
        {
            if (k == Keyword.None) return;
            _keywordsThisTurn.Remove(k);
            _keywordsThisCombat.Remove(k);
        }

        public void ClearTempKeywordsEndOfTurn()
        {
            _keywordsThisTurn.Clear();
            _keywordsThisCombat.Clear();
        }

        public void ClearTempKeywordsEndOfCombat()
        {
            _keywordsThisCombat.Clear();
        }

        public override string ToString() => $"{Def.displayName} ({InstanceId})";
    }
}