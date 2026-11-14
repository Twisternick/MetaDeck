# Launch plan

What MetaDeck still needs before a public launch, and how to build each part on top of what's already here.

**Decisions so far:**
- Web only (desktop and phone browsers), no app stores.
- Soft launch free: Gold and Dust only. Gems for real money come later, once players stick around and the legal work is done.
- Hosted on this Windows PC.
- Sound comes from licensed or free sound-effect packs.

## Order

| Phase | Items | Why this order |
|---|---|---|
| A. Foundation ✅ built | 5 Accounts & storage, 10 Hosting & operations | Everything else stores data or needs the server to be public. The code is done; setting up this PC (tunnel, startup task, monitor) is in `HOSTING.md`. Email recovery is left for phase D. |
| B. First impression ✅ built | 1 Tutorial, 2 Sound, 4a Privacy/terms/age gate | What every new player meets in their first five minutes. Still to do: drop sound files into `assets/audio/` (see its README), and fill in the `[bracketed]` details in `legal/privacy.html` and `legal/terms.html`. |
| C. Retention ✅ built | 9 History & deck codes, 8 Friends & safety, 7 Ranked | Reasons to come back. Ranked needs the match records from 9. Left for later: replays, and friend presence outside the online lobby. |
| **Soft launch** | | |
| D. Money ✅ built | 3 Payments, 4b Loot-box and minor rules | Only when Gems are switched on. Paddle (merchant of record), adults only, no Gem packs in Belgium. Switching it on: set up Paddle (HOSTING.md → Payments), fill in the legal pages, and have them reviewed. |

---

## 5. Accounts and storage

**Move from the JSON file to SQLite.** Node 24 (installed here) has SQLite built in (`node:sqlite`), so the project stays dependency-free. One file, `metadeck.db`, in WAL mode, with these tables:
- `users` (id, name, password hash, recovery hash, created, birth year, banned)
- `sessions`
- `profiles` (the economy profile as JSON, keyed by user)
- `matches`, needed for history and ranked
- `friends`, `blocks`, `reports`, needed for social features
- `events`, needed for analytics

Write a one-time migration from `accounts.json`, and keep `accounts.mjs`'s interface the same so `account-api.mjs` and the tests barely change.

**Move the data folder out of OneDrive.** The repo lives in OneDrive, so `web/data/` (password hashes, sessions, the admin token) is being synced to the cloud. Syncing a live database file risks file locks and corruption. `serve.mjs` already reads `DATA_DIR`, so set it to something like `C:\MetaDeckData`. OneDrive is a fine place for the nightly *backups*.

**Check vs-AI matches on the server (built).** The browser still runs the match, so it stays instant with no turn clock. For a signed-in player, though, the server deals it: it picks the shuffle seed and who goes first. At the end, the browser sends the player's moves back, and the server replays them against the same deterministic AI. The rewards come from the server's replay, so a made-up result earns nothing (`server/ai-match.mjs`). Guests play locally, as before.

**Password recovery.** Recovery codes are enough while the game is free. Add an optional email address (sent through Resend or Postmark, both with free tiers) before Gems go on sale, because paying players expect "forgot password" to work.

## 10. Hosting and operations (on this PC)

**Make the site public: Cloudflare Tunnel.** `cloudflared` makes an outgoing connection to Cloudflare, so you need no port forwarding and your home IP stays hidden. You get free HTTPS, WebSockets work, and Cloudflare can cache the art. You need a domain (about $10/year) on Cloudflare.
- **Set `TRUST_PROXY=1`.** The tunnel connects from localhost, so without this every player looks like `127.0.0.1` and shares a single rate limit.
- **Don't let the tunnel rewrite the `Host` header to `localhost`** (cloudflared's `httpHostHeader` setting). The server treats localhost requests as *this machine*: test purchases and admin endpoints. Rewriting the header would hand those powers to every visitor. Add a test that checks this.

**Keep it running.**
- Run `serve.mjs` and `cloudflared` as Windows services (NSSM, or Task Scheduler "at startup" with restart on failure).
- Turn off sleep, set Windows Update active hours, and set the PC to power back on after a power cut (a BIOS setting).
- A small UPS is worth it.

**Caching.** `serve.mjs` sends `Cache-Control: no-cache` for everything, so all 410 card images are revalidated on every visit and none are cached by Cloudflare. Instead:
- Give images and fonts a long cache lifetime with a version in the URL.
- Keep `no-cache` only on `index.html` and the JS.

**Version check.** Send the build version in the socket's `hello`. A client running old code after a balance patch gets told to reload.

**Health checks and alerts.** Add a `/healthz` endpoint that reports whether the DB opens and how many players and rooms there are (`lobby.stats()` already has these). Point UptimeRobot (free) at it so you get an email when the PC or tunnel goes down.

**Errors.**
- In the browser, send `window.onerror` and `unhandledrejection` to a rate-limited `/api/client-error`.
- On the server, catch uncaught errors, log them, and let the service restart the process.
- Write logs as JSON lines, one file per day, and delete files after 30 days.

**Analytics without a cookie banner.** Use your own `/api/event` endpoint writing to the `events` table, with no third-party cookies. Track a short funnel: first visit, tutorial step N, first match, first win, sign-up, a return on day 1 and day 7, first pack opened. Cloudflare Web Analytics (free, no cookies) covers page views.

**Backups and restarts.**
- **Backups:** every night, `VACUUM INTO` a dated copy in a OneDrive folder, keeping 14 days. Do a test restore once.
- **Restarting for updates:**
  1. Run `npm run maintenance`. It tells online players "restarting in 5 minutes" and stops new matches.
  2. Wait for running matches to finish (`lobby.close()` already exists for shutdown).
  3. `git pull`, then restart the service.

**Limits of a home PC.** Card-game traffic is tiny, and Node on one PC can easily handle hundreds of players at once, especially with Cloudflare serving the art. The real risk is the PC itself: reboots, power cuts, your own use of it. Plan to move to a small hosted server if the game takes off. SQLite and the services move with it unchanged.

## 1. Tutorial

**A scripted first match, about 4 minutes.**
- **Setup:** a fixed tutorial deck for each side and a fixed shuffle (the engine already takes an RNG, `src/engine/rng.js`). The AI plays a scripted line, so every step happens on cue.
- **Overlay:** each step dims the screen except for the one thing to do, with a pointer and one sentence. Only that action is allowed until it's done (filter the moves allowed in `match.js`).
- **Steps:**
  1. Drag a monster to the mat; read Bandwidth.
  2. Attack the hero.
  3. A Guard monster blocks you; attack it instead.
  4. Cast a targeted spell (show the arrow).
  5. The enemy attacks, and you answer with a Quick card.
  6. A keyword fires (callout, then the **? Keywords** drawer).
  7. Win. Confetti.
- **Reward:** a free pack for finishing, then hand the player straight to a first real match against an easy AI with a recommended starter deck. Make the tutorial skippable but offer it until it's finished.

**First-time tips after the tutorial.** One-time pop-ups stored as profile flags: first Nitro/Combo/other keyword in play, first pack, first crafting screen, first visit to online play, first season tier. Each fires once, and Settings has "reset tips".

**An easier AI for the first games.** Add a difficulty setting to `ai.js`, for example taking a random good move instead of the best one 30% of the time. Use Easy for a player's first 3 games, then Normal.

## 2. Sound

**Where the sounds come from (all fine for commercial use):**
- **Kenney** audio packs (UI Audio, Interface Sounds, Impact Sounds, RPG Audio). CC0, no attribution needed.
- **Sonniss GDC Game Audio Bundles.** Large, royalty-free, commercial use allowed.
- **Freesound,** filtered to CC0.
- **Music:** buy a game-music pack (itch.io, Humble bundles) for a menu loop and one or two match loops. CC-BY tracks (e.g. Kevin MacLeod) work if you credit them.
- Keep `assets/audio/CREDITS.md` listing every file's source and license.

**Code.** Build `src/ui/audio.js` the same way as the art slots:
- **Slots:** each sound is a named slot (`assets/audio/<name>.mp3`, MP3 because every browser plays it), and a missing file simply plays nothing.
- **Playback:** use Web Audio so many short sounds can overlap with no delay.
- **Variety:** small random pitch and volume changes stop repeats from sounding robotic.

**What to hook up:**
- **Engine events** (`state.events`): `play`, `summon`, `attack`, `damage` (and a big hit for HEADSHOT), `death`, `heal`, `buff`/`debuff`, `shield`/`checkpoint`, `draw`, `turn`, `burn`, `silence`, `keyword`, `end`.
- **UI:** hover, click, a card lifting from the hand, a valid drop vs a cancel, turn-timer ticks in the last 10 seconds, the Quick-response prompt.
- **Packs:** the tear, each card flip, and rising stingers for Rare, Epic and Legendary, plus a sound for premium cards.
- **Results:** a victory and a defeat stinger, plus coins and XP ticking up.
- **Genre flavor (optional, high payoff):** one play sound per archetype. Racing revs an engine, FPS racks a slide, Horror plays a sting, Platformer a coin blip. It sells the "every deck is a genre" idea cheaply.

**Settings.** Master, music and effects sliders, plus mute, saved per browser. Unlock audio on the first click (browsers block autoplay) and fade the music when the tab is hidden.

## 3. Payments (phase D)

**Use a merchant of record: Paddle or Lemon Squeezy.** They sell to the player on your behalf and handle worldwide VAT and sales tax, refunds and chargebacks. Selling digital goods yourself with plain Stripe means registering for EU VAT and more, which isn't worth it for a solo project. Stripe Checkout plus Stripe Tax is the alternative if you'd rather run your own business setup.

**Flow** (no SDK needed; use `fetch` and Node's `crypto`):
1. The shop asks `POST /api/shop/checkout {bundleId}`. The server creates a hosted checkout session with the account id and bundle in its metadata and returns the URL.
2. The player pays on the provider's page. Card details never touch your server.
3. The provider calls your webhook (reachable through the tunnel). Verify its signature, record the transaction id (so a retry never credits twice), then call `creditGems`.
4. On a refund or chargeback webhook, take the Gems back. If they're already spent, the balance goes negative and the shop locks until it's repaid.

The sign-in requirement already exists: purchases need an account.

## 4. Legal

*This is a checklist, not legal advice. Have a lawyer review the documents and the loot-box setup before taking money.*

**4a. Needed at the soft launch (even free):**
- **Privacy policy.** What you collect: name, password hash, IP address (rate limits), birth year, match records, the analytics events. Why you collect it, how long you keep it, and that you don't sell it. Account deletion already exists. Add **data export** (download my data as JSON) for GDPR.
- **Terms of service.** Rules of conduct, bans, "virtual items have no cash value and aren't yours to sell", and the right to change balance.
- **No cookie banner needed** as long as the only cookie is the sign-in session (strictly necessary) and the analytics stays cookieless.
- **Age gate at sign-up.** A neutral "birth year" picker, not "are you 13?". US COPPA: under 13 means no account, or a restricted one with no social features. Store the birth year so phase D can apply rules for minors.
- **Footer links** to both documents, plus a contact address.

**4b. Before Gems go on sale:**
- **Loot boxes by country.** Cloudflare adds the visitor's country header for free (`CF-IPCountry`). In **Belgium**, block buying packs with Gems (Gold packs and direct crafting stay). The Netherlands overturned its ban in 2022, but watch it. Odds are already published, and the pity timer helps.
- **Minors:** monthly spending caps under 18, or no purchases under 16. Decide with the lawyer.
- **EU 14-day right to withdraw:** at checkout the player has to explicitly agree that the Gems arrive immediately and that this ends the right to withdraw. The merchant of record handles most of this.
- A refund policy page, and a business or payout setup with the provider.

## 9. Match history, stats and deck codes

- **Deck codes (do first; no server needed).** Encode the archetype plus each card's count into a short base64url string (e.g. `MD1:RPG:…`). Add **Copy code** and **Import** buttons to the deck builder. It's easy to share on Discord or Reddit, and it's free word of mouth.
- **Match records.** Every server-run match (online and vs-AI) writes a row: when, both decks, opponent, result, turns, duration, how it ended (hero dead, forfeit, timeout), rating change.
- **Screens:**
  - History: the last 50 matches.
  - Stats: win rate by archetype and by deck, and best win streak.
  - A small profile card: most-played archetype, rank, collection %.
- **Later: replays.** Store the shuffle seed and the action list with each match. The engine is deterministic given its RNG, so a replay is just running the match again.

## 8. Friends and player safety

- **Friends:**
  - Add someone by account name, then they accept.
  - The lobby socket shows who's online and in a match.
  - **Challenge** a friend, which opens the existing private-room flow without typing a code.
- **Emotes, no free chat:** six presets (Hello, Well played, Thanks, Oops, Wow, Good game). The server only accepts the six emote ids and limits how often they can be sent, there's a one-click "mute opponent", and the client can mute all emotes by default. No free text means almost nothing to moderate.
- **Report:** after an online match, report the opponent (offensive name, stalling, cheating suspicion). Reports go in the DB, and `npm run reports` lists them with the match record attached.
- **Block:** a blocked player is never paired with you and can't send you friend requests or challenges.
- **Names:** account names are the one place players can write text. Filter a word list at sign-up, and add `npm run rename -- <name>` and `npm run ban -- <name>` for you as admin.

## 7. Ranked

- **Rating:** a hidden Glicko-2 rating per account. It settles new players' ratings faster than Elo, which matters with a small player base.
- **Visible ladder:**
  - Ranks: Bronze → Silver → Gold → Platinum → Diamond, each in 5 divisions with 3 stars.
  - You can't fall below a rank floor at each tier.
  - A top "Meta" rank shows a leaderboard number.
- **Seasons:** follow the existing monthly season. At reset, drop everyone a few divisions, and give end-of-season rewards by peak rank (Gold, packs, a card back for Diamond+).
- **Matchmaking:**
  - Start with a narrow window (±100 rating), widened by 50 every 10 seconds.
  - **With few players, don't split the queue:** one queue, rated for signed-in players, unrated for guests.
  - After about 60 seconds with no match, offer "play the AI while you wait" and say clearly that it's the AI.
- **Abuse:** a forfeit counts as a loss (it already ends the match). Limit rating gains against the same opponent within 24 hours to stop win-trading. Only signed-in players are ranked.
