// The card list page (/cards): filters the table by search text, deck and type as you type.

const form = document.querySelector('.card-filter');
const rows = [...document.querySelectorAll('table.cards tbody tr')];

function apply() {
  const words = form.q.value.toLowerCase().split(/\s+/).filter(Boolean);
  const deck = form.deck.value;
  const type = form.type.value;
  let shown = 0;
  for (const row of rows) {
    const match = (!deck || row.dataset.deck === deck) && (!type || row.dataset.type === type)
      && words.every(w => row.dataset.search.includes(w));
    row.hidden = !match;
    if (match) shown++;
  }
  form.count.value = `${shown} of ${rows.length} cards`;
}

form.addEventListener('input', apply);
form.addEventListener('submit', e => e.preventDefault());
apply();
