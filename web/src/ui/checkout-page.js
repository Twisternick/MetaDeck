// checkout.html: the one page that loads Paddle.js (see server/payments.mjs). The server sends the
// browser here with ?_ptxn=<transaction id>; once Paddle.js is initialised it opens the checkout for
// that transaction by itself. Afterwards the player goes back to the game, which waits for the Gems
// (they're credited by Paddle's webhook, not by this page).

const PADDLE_JS = 'https://cdn.paddle.com/paddle/v2/paddle.js';
const status = document.getElementById('checkout-status');
const say = text => { status.textContent = text; };

async function start() {
  if (!new URLSearchParams(location.search).get('_ptxn')) {
    say('There’s no purchase to check out. Go back to the shop and pick a Gem bundle.');
    return;
  }
  let config;
  try { config = await (await fetch('/api/shop/config', { cache: 'no-store' })).json(); } catch { config = null; }
  if (!config?.enabled) { say('Gem purchases aren’t available right now.'); return; }

  const script = document.createElement('script');
  script.src = PADDLE_JS;
  script.onerror = () => say('The checkout couldn’t load. Check your connection (or an ad blocker) and try again.');
  script.onload = () => {
    const Paddle = window.Paddle;
    if (config.sandbox) Paddle.Environment.set('sandbox');
    let completed = false;
    Paddle.Initialize({
      token: config.clientToken,
      checkout: { settings: { displayMode: 'overlay', theme: 'dark', successUrl: `${location.origin}/?purchase=success` } },
      eventCallback: e => {
        if (e?.name === 'checkout.loaded') say('Complete your purchase in the checkout window.');
        if (e?.name === 'checkout.completed') completed = true;
        if (e?.name === 'checkout.closed') location.href = completed ? '/?purchase=success' : '/?purchase=closed';
      },
    });
  };
  document.head.append(script);
}

start();
