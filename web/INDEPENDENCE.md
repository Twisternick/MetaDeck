# Running MetaDeck under its own name

How to give the game its own identity, so players, payment providers and the public never see your personal email, name or home address, and so the game could be handed to someone else without untangling your personal accounts. Do these roughly in order: each step uses the one before it.

This is practical setup, not legal or tax advice. For the business entity and payouts, a short consultation with a local accountant is worth it.

## 1. The domain

Everything else hangs off the domain, so do this first.

- Register it at Cloudflare (HOSTING.md step 3 needs it there anyway), e.g. `metadeck.gg` or `playmetadeck.com`.
- Cloudflare hides the registrant's details from public WHOIS by default. The registrar itself still needs real contact details; once the entity in step 4 exists, change the registrant to it.

## 2. The game's email

Players, Paddle and app stores need an address that works and isn't yours. Use addresses on the game's domain, delivered to a mailbox that belongs to the game.

1. **Make a mailbox just for the game**, e.g. a new Proton or Gmail account (`metadeck.team@…`) or a custom-domain mailbox (Zoho Mail and Proton both have plans for this; check what their free tiers include now). Don't reuse or forward from your personal account. If you ever hand the game over, this mailbox goes with it.
2. **In Cloudflare → Email → Email Routing**, turn it on for the domain and add addresses that forward to that mailbox:

   | Address | Used for |
   |---|---|
   | `support@` | The contact address on the legal pages and the footer. Players write here. |
   | `privacy@` | Data requests. Can forward to the same mailbox. |
   | `billing@` | Paddle and other vendors' account emails. |

   With a custom-domain mailbox (Zoho, Proton), you set up these addresses there instead, and replies go out from `support@` automatically. With plain forwarding, set the mailbox's "send mail as" to `support@yourdomain` so replies don't show the mailbox's own address.
3. **Put `support@yourdomain` in `DATA_DIR\site.json`** as `contactEmail` (HOSTING.md, "Who runs the game"). The privacy policy, terms, refund policy and the menu footer pick it up.

## 3. Accounts the game uses

Sign up for (or move) each of these with the game's address (`billing@` works well), not your personal one. Turn on two-factor authentication on each, and keep the logins and recovery codes in a password manager vault that's only for the game (Bitwarden and 1Password both do shared vaults), so a trusted second person can get in if you can't.

| Service | What it's for | Notes |
|---|---|---|
| Cloudflare | Domain, tunnel, email routing | Change the login email under *My Profile*, or invite the game's address as a Super Administrator and remove your personal one. |
| Paddle | Gem payments | Sign up as the business (step 4). Paddle checks identity and pays out to the business bank account. |
| UptimeRobot | Downtime alerts | HOSTING.md step 5. |
| GitHub | The source code | Make a free **organization** (e.g. `metadeck-game`) and transfer the repo to it (*Settings → Transfer*). Your personal account stays a member. |
| Discord, X, Reddit, … | Community | Register handles with the game's address before someone else takes them. |

## 4. A business to run it

The legal pages name whoever runs the game, and Paddle pays out to them. As a sole trader that's your own name. A business entity (an LLC in the US, a limited company in the UK) puts its name there instead and keeps the game's liabilities apart from your own.

- Paddle and app stores require real identity checks, so the game can't be run anonymously. An entity is how your name stays off the public pages.
- Use a **registered agent** or virtual office address for the entity, so your home address isn't on public filings or the legal pages.
- Open a **business bank account** for Paddle payouts and the game's costs (domain, mail), so the money is separate too.
- Then fill in `operator`, `country` and `governingLaw` in `site.json`, and set `updated` to the day you publish.

## 5. Your name in the source code

- **Commit author.** Every commit records an author name and email, and anyone who can see the repo can read them. The history so far shows your personal Gmail and, on the first commit, a work address. If the repo is public or ever will be, set a private address for future commits from now on:

  ```bash
  git config user.email "metadeck-game@users.noreply.github.com"
  ```

  For the noreply address, use the one GitHub shows under *Settings → Emails* for the account or organization that will commit. Rewriting old commits to remove the addresses is possible (`git filter-repo --mailmap`), but it rewrites history for everyone who has a copy, so only do it while the repo is private and nobody else has cloned it.
- **Keep the repo private** until that's done. The game doesn't need a public repo to run.
- The code itself names no one: the legal details come from `site.json`, which lives in `DATA_DIR` and isn't committed.

## 6. The home PC

The Cloudflare Tunnel (HOSTING.md step 3) already keeps your home IP address hidden: players only ever reach Cloudflare. Keep it that way:

- Don't open ports on the router or share the PC's address for "faster" connections.
- Don't put a personal Windows account name in anything players see. The server never shows paths or the machine name to players.

## Checklist

- [ ] Domain registered at Cloudflare
- [ ] Game mailbox made; `support@`, `privacy@`, `billing@` routed to it
- [ ] `DATA_DIR\site.json` filled in, server restarted, legal pages show no highlighted placeholders
- [ ] Cloudflare, Paddle, UptimeRobot, GitHub and community accounts on the game's address, with 2FA
- [ ] Logins and recovery codes in the game's own password vault, with a second person who can reach it
- [ ] Business entity, registered agent address and business bank account (before Gems go on sale)
- [ ] Repo moved to a GitHub organization; future commits use a noreply address
