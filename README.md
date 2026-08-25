# SantaSecret 🎁

A **simple, privacy-respecting, self-hosted Secret Santa organiser**. An organiser sets up an
event, adds members, optionally marks exclusion pairs, and draws names — then each member gets an
email showing **who they're buying for** and a private, no-login link to manage **their own
wishlist** and view their recipient's. Nobody ever learns who's buying for *them*.

- 🔑 **No logins for members** — each gets an unguessable private link.
- 🛡️ **Organiser auth via [Cloudflare Access](https://developers.cloudflare.com/cloudflare-one/policies/access/)** (email PIN) — no passwords.
- ✅ **Approval gate** — the site owner approves who may run events.
- 🎲 **Proper draw** — single-cycle derangement (no self-draws) that respects exclusion pairs.
- 🔒 **Secrecy first** — the who-buys-for-whom mapping is hidden, even from the organiser.
- 🎨 **Festive, mobile-first** design with a first-time gift-unwrap reveal, light/dark toggle.
- 💸 **~$0** on a small always-on box behind a free Cloudflare Tunnel.

> Built as a sibling of the RSVP system — it reuses the same architecture (Node + SQLite +
> Cloudflare Access + Resend + Tunnel).

## How it works

```
 Member (email link)                Organiser / Admin
        │  /m/:token (public)              │  /organiser, /admin (Cloudflare Access)
        ▼                                  ▼
 ┌───────────────────────────── Cloudflare ─────────────────────────────┐
 │  Access gates /admin & /organiser · Tunnel · WAF/Turnstile           │
 └───────────────────────────────┬──────────────────────────────────────┘
                                  ▼  (tunnel → localhost:3001)
                    Node + Express + SQLite  (this app)
```

- **Organiser** (approved, behind Access): create event → add members (name + email) → set
  exclusions → **Draw names**. A status dashboard shows who's filled a wishlist / opened their
  link, with nudges — but never who drew whom.
- **Draw:** `src/draw.js` builds a random single cycle so everyone gives to and receives from one
  other person, nobody draws themselves, and no excluded pair is adjacent. Re-drawable.
- **Member** (`/m/:token`, no login): first visit after the draw shows a wrapped gift to unwrap
  (with confetti); then they see who they're buying for + that person's wishlist, and manage their
  own wishlist (name + link + note).
- **Email (Resend):** on draw, each member is emailed their match + link; organiser can nudge
  members with empty wishlists.

## Quick start (local dev)

```bash
npm ci
cp .env.example .env         # set ADMIN_EMAIL, SECRET; for local use DEV_BYPASS_AUTH=true + DEV_EMAIL
npm run css:build
npm run seed                 # creates a drawn demo event and prints member links
npm run dev                  # http://localhost:3001
npm run test:draw            # unit-check the draw
```

## Configuration

All via environment variables — see `.env.example`. Key ones: `PORT`, `BASE_URL`, `APP_TZ`,
`SECRET`, `ADMIN_EMAIL`, `CF_ACCESS_TEAM_DOMAIN`, `CF_ACCESS_AUD`, `RESEND_API_KEY`, `MAIL_FROM`,
`PURGE_DAYS`. No secrets live in the code; `.env` and `data.db` are git-ignored.

## Production

Run `sudo bash deploy/setup.sh` on the box (installs to `/opt/secretsanta/app`, creates the
`secretsanta` service user, systemd service + nightly purge/backup timers), edit
`/opt/secretsanta/app/.env`, then `sudo systemctl enable --now secretsanta`. Wire up the tunnel +
Access per `deploy/cloudflared.md`. Updates: get new code onto the box and re-run `setup.sh`.

## Security & privacy

- App binds to `127.0.0.1`, reachable only via Cloudflare; the Access JWT is verified server-side.
- Member links are bearer tokens (~92-bit) — share privately.
- The assignment reverse-lookup (who has X) is never exposed to members or the organiser.
- Data auto-deletes ~`PURGE_DAYS` after the exchange date. App logs are response-only.
- Never commit `.env` or `data.db`.

## License

[MIT](LICENSE).
