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
| `PORT` | 5173 unless something else uses it. |
| `LOG_DIR` | Optional; defaults to `DATA_DIR\logs`. |

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

## Limits of a home PC

Card-game traffic is tiny, and with Cloudflare serving the art, one Node process on this PC can handle hundreds of players at once. The weak point is the PC itself: Windows updates, power cuts, and your own use of it (a game hogging the CPU, a reboot).

If MetaDeck grows, move the same setup to a small Linux server. The database file, the backups and cloudflared all work there unchanged.
