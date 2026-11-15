# Hosting MetaDeck on this PC

How to run the public server on this Windows PC: reachable over HTTPS, started at boot, restarted when it crashes, backed up every night, and watched for downtime. Nothing needs to be opened on your router.

## What you need

- **Node 22.13 or newer.** It has to be on the *system* PATH, because the startup task runs as a service. The Node installer does this by default. Check with `node --version`.
- **A domain on Cloudflare** (about $10/year; buy it there or move an existing one). Cloudflare's free plan is enough.
- About an hour.

## 1. Move the data out of OneDrive

The repo lives in OneDrive, so `web/data/` (the database, password hashes, the admin token) is being synced to the cloud, and a live database in a synced folder can be corrupted. Pick a folder outside OneDrive, e.g. `C:\MetaDeckData`, and move what's in `web\data\` there.

If it contains `accounts.json` from before the database, the server imports it into `metadeck.db` the first time it starts and renames it to `accounts.json.imported`.

## 2. Settings

Copy `tools\windows\server-env.example.cmd` to `tools\windows\server-env.cmd` (git ignores it) and edit it:

| Setting | What it does |
|---|---|
| `DATA_DIR` | The data folder from step 1. |
| `BACKUP_DIR` | Where nightly copies of the database go. A OneDrive folder is fine here: backups are finished files, and syncing them gives you an offsite copy. |
| `BACKUP_DAYS` | How many days of backups to keep (14). |
| `TRUST_PROXY=1` | Required behind the tunnel. Without it every player looks like `127.0.0.1` and they all share one rate limit. The server logs a warning if it sees tunnel traffic without it. |
| `PUBLIC_URL=https://play.yourdomain.com` | Recommended. Link previews on Discord, X, Facebook and so on need absolute URLs, so the server adds this address to the share image and page link in `index.html`. Without it, shared links may show no picture. |
| `PORT` | 5173 unless something else uses it. |
| `LOG_DIR` | Optional; defaults to `DATA_DIR\logs`. |

### Who runs the game: `site.json`

The privacy policy, terms and refund policy name who runs MetaDeck and how to reach them. Those details are kept in `DATA_DIR\site.json`, not in the repo, so the public source names no one. Copy `tools\site.example.json` there and fill it in:

| Field | What it's for |
|---|---|
| `operator` | Who runs the game, as the legal pages name them: your company, or your name if you don't have one. |
| `country` | Where the operator is, e.g. `the United States`. |
| `governingLaw` | Optional. The law the terms are under, e.g. `the State of Delaware`. Defaults to `country`. |
| `contactEmail` | The game's own address (see `INDEPENDENCE.md`), never a personal one. Shown on the legal pages and as **Contact** in the menu footer. |
| `updated` | The legal pages' "Last updated" date. Change it whenever you change the pages. |

Restart the server after editing it. While a field is empty, the server logs which placeholders are still showing, and the pages show them highlighted.

Run `tools\windows\run-server.cmd` once by hand and open http://localhost:5173 to check it works. That script restarts the server whenever it exits. Close the window to stop it.

## 3. Cloudflare Tunnel

The tunnel is an outgoing connection from this PC to Cloudflare, so you don't forward any ports and your home IP stays hidden. Cloudflare provides the HTTPS certificate, and WebSockets (online play) work through it.

1. Install cloudflared:

   ```bash
   winget install --id Cloudflare.cloudflared
   ```

2. In the Cloudflare dashboard, go to **Zero Trust → Networks → Tunnels → Create a tunnel** (type *Cloudflared*). Name it `metadeck`.
3. It shows an install command with a token: `cloudflared service install <token>`. Run it in an administrator terminal. cloudflared now runs as a Windows service of its own and starts at boot.
4. Add a **public hostname**, e.g. `play.yourdomain.com`, with service **HTTP** and URL `localhost:5173`.
   - **Leave "HTTP Host Header" empty.** If it were set to `localhost`, the server would take outside requests for this machine. The server also refuses admin and test purchases for anything carrying Cloudflare's headers, but don't rely on that alone.
5. In **SSL/TLS**, choose *Full*. Under **SSL/TLS → Edge Certificates**, turn on *Always Use HTTPS*.

Open `https://play.yourdomain.com` from your phone on mobile data (not your Wi-Fi) to check that it works from outside.

Art and fonts are sent with a one-day cache lifetime, so Cloudflare serves most of the 400+ card images itself and they don't use this PC's upload bandwidth. The code is always revalidated, so an update reaches players right away.

## 4. Start at boot

Register the scheduled task from an administrator PowerShell:

```bash
powershell -ExecutionPolicy Bypass -File tools\windows\install-task.ps1
```

Then start it once:

```bash
powershell -Command "Start-ScheduledTask -TaskName MetaDeck"
```

The task runs `run-server.cmd` at boot whether or not anyone is signed in. To remove it:

```bash
powershell -Command "Unregister-ScheduledTask -TaskName MetaDeck -Confirm:$false"
```

**Keep the PC awake and running:**
- Never sleep on mains power:

  ```bash
  powercfg /change standby-timeout-ac 0
  ```

- Set **Windows Update → Advanced options → Active hours** to the times people play, so updates don't restart the PC then.
- In the BIOS/UEFI, set *Restore on AC power loss* to **Power On**, so the PC comes back after a power cut.
- A small UPS rides out short power cuts.

## 5. Get told when it's down

Create a free [UptimeRobot](https://uptimerobot.com) monitor:
- **Type:** HTTP(s)
- **URL:** `https://play.yourdomain.com/healthz`
- **Interval:** 5 minutes, with email alerts.

`/healthz` returns 200 with the version, uptime and player counts while the database answers, and 503 if it doesn't. If the PC, the tunnel or the server is down, the monitor emails you.

## Before launch: free the founder places

The first 100 accounts on the server become Meta Founders, including any test accounts you made while setting up. Just before you open the game to players, run:

```bash
npm run moderate -- founders --reset
```

This unmakes every current founder, so the first real player becomes Meta Founder #1. To see who's a founder later, run `npm run moderate -- founders`. To grant or take it away by hand, use `founder <name>` or `unfounder <name>`. Set `FOUNDER_SLOTS` in `server-env.cmd` to change the 100, or `FOUNDER_SLOTS=0` to turn founders off.

## Updating the game

```bash
git pull
```

```bash
npm test
```

```bash
npm run maintenance
```

`npm run maintenance` tells every connected player that the server is restarting and stops new matches from starting. Matches already in progress can finish; once none are left (or after 10 minutes at the latest), the server exits. `run-server.cmd` then starts it again with the new code.

Give a different warning with `npm run maintenance -- 2`. Use `0` to restart as soon as no match is running.

Players who already have the page open get a "MetaDeck has been updated — Reload" bar within a few minutes.

## Backups

The server copies the database to `BACKUP_DIR` shortly after it starts and then once a day, keeping `BACKUP_DAYS` days. The copies are `metadeck-YYYY-MM-DD.db`.

- **Back up now:**

  ```bash
  npm run backup
  ```

- **Restore:** stop the task first, then run:

  ```bash
  npm run backup -- --restore "<backup file>"
  ```

  The current database is kept as `metadeck.db.before-restore-…`.

**Try a restore once**, on a copy of the data folder, before you need it.

## Logs, players and numbers

- **Server log:** `DATA_DIR\logs\YYYY-MM-DD.log`, one JSON line per message, kept 30 days. Browser errors from players show up there too, as `client: …`.
- **Reports and moderation:**

  ```bash
  npm run reports
  ```

  Lists open player reports. Deal with them using `npm run moderate -- resolve <id>`, `rename <name> <new name>`, `ban <name>` or `unban <name>`. To block more words in account names, list them one per line in `DATA_DIR\blocked-names.txt` and restart the server.
- **Player feedback:**

  ```bash
  npm run feedback
  ```

  Lists open feedback from the game's Feedback dialog (bugs, ideas, balance notes), oldest first. Add `--kind bug` for one kind or `--all` for resolved ones too, and resolve with `npm run feedback -- done <id>`. Share `https://<your domain>/#feedback` in posts and on Discord: it opens the dialog.
- **Players:**

  ```bash
  npm run users
  ```

  Shows the accounts and who's online; add `-- --list` for every account.
- **Funnel:**

  ```bash
  npm run report
  ```

  Shows per day: visitors, sign-ups, matches started, matches recorded and packs opened, plus how many new accounts came back on day 1 and in days 2–7. Guests are counted without cookies (a daily-rotating hash), so no cookie banner is needed.
- The admin tools (`users`, `grant`, `set-password`, `maintenance`, `backup`, `reports`, `moderate`) need the same `DATA_DIR` as the server. Run them from a terminal where you've run `tools\windows\server-env.cmd` first, or set `DATA_DIR` yourself.

## Payments (Gems for real money)

Gem purchases go through [Paddle](https://www.paddle.com), the merchant of record: Paddle sells to the player and handles card details, sales tax and VAT, invoices, refunds and chargebacks, and pays you out. Payments stay off until `DATA_DIR\paddle.json` exists.

1. **Sign up for a sandbox account** at sandbox-vendors.paddle.com. It works like the real one, with test cards.
2. **Create a product "Gems"** with one price per bundle: $0.99, $4.99, $9.99, $19.99, $49.99 (one-time, matching `GEM_BUNDLES` in `src/data/economy.js`). Note each price's `pri_…` id.
3. **Developer tools → Authentication:**
   - Create an **API key** with permission to read and write transactions.
   - Create a **client-side token**.
4. **Developer tools → Notifications → New destination:**
   - **URL:** `https://play.yourdomain.com/api/paddle/webhook`
   - **Events:** `transaction.completed`, `adjustment.created`, `adjustment.updated`

   Copy its **secret key** (`pdl_ntfset_…`).
5. **Checkout → Checkout settings:**
   - Set the **default payment link** to `https://play.yourdomain.com/checkout.html`.
   - Add your domain to the approved domains.
6. **Write `DATA_DIR\paddle.json`:**

   ```json
   {
     "apiKey": "pdl_sdbx_apikey_…",
     "clientToken": "test_…",
     "webhookSecret": "pdl_ntfset_…",
     "prices": { "gems-100": "pri_…", "gems-550": "pri_…", "gems-1200": "pri_…", "gems-2600": "pri_…", "gems-7000": "pri_…" }
   }
   ```

7. **Restart the server.** It logs "Gem purchases are on (Paddle sandbox)".
8. **Buy a bundle with a test card.** The Gems arrive a few seconds after the checkout closes. Then refund it from the Paddle dashboard and watch them go.

**To go live:**
- Apply for a live Paddle account. Paddle reviews the site, so the terms, privacy policy and refund policy need to be filled in and published.
- Repeat steps 2–6 in the live dashboard. A `pdl_live_…` key switches the server to the live API by itself.
- Keep `paddle.json` out of OneDrive and backups you share: it holds the API key.

`npm run report` shows purchases, revenue and refunds alongside the rest.

## Limits of a home PC

Card-game traffic is tiny, and with Cloudflare serving the art, one Node process on this PC can handle hundreds of players at once. The weak point is the PC itself: Windows updates, power cuts, and your own use of it (a game hogging the CPU, a reboot).

If MetaDeck grows, move the same setup to a small Linux server. The database file, the backups and cloudflared all work there unchanged.
