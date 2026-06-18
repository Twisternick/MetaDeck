using TMPro;
using UnityEngine;
using UnityEngine.UI;
using MetaDeck.Core;
using MetaDeck.Rules;

namespace MetaDeck.Presentation
{
    public sealed class CardUI : MonoBehaviour
    {
        [Header("Text")]
        [SerializeField] private TMP_Text nameText;
        [SerializeField] private TMP_Text costText;
        [SerializeField] private TMP_Text attackText;
        [SerializeField] private TMP_Text healthText;
        [SerializeField] private TMP_Text descriptionText;

        [SerializeField] private Slider healthBar; // optional health bar 
        [SerializeField] private GameObject attackContainer;


        [Header("Art")]
        [SerializeField] private Image artImage; // or Image if using Sprite

        public void Render(CardInstance card)
        {
            nameText.text = card.Def.displayName;
            costText.text = card.CurrentCost.ToString();
            attackText.text = card.GetAttack().ToString();
            healthText.text = card.GetHealth().ToString() + " / " + card.GetMaxHealth().ToString();

            descriptionText.text = (card.Keywords.Count == 1 && card.Keywords.Contains(MetaDeck.Rules.Keyword.None)) ? "" : "<b>" + string.Join(", ", card.Keywords) + "</b>" + "\n" + MetaDeck.UI.EffectText.BuildCardText(card.Def);

            if (artImage != null) artImage.sprite = card.Def.artSprite;
            if (card.Def.type == CardType.Monster)
            {
                attackContainer.SetActive(true);
                healthText.gameObject.SetActive(true);
                if (healthBar != null)
                {
                    healthBar.gameObject.SetActive(true);
                    healthBar.maxValue = card.GetMaxHealth();
                    healthBar.value = card.GetHealth();
                }
            }
            else
            {
                attackContainer.SetActive(false);
                healthText.gameObject.SetActive(false);
                if (healthBar != null)
                {
                    healthBar.gameObject.SetActive(false);
                }
            }
        }
    }
}