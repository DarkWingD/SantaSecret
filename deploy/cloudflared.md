# Cloudflare Tunnel + Access — Secret Santa

Runs at `secretsanta.<yourdomain>` on port **3001**, alongside your other tunnelled apps.

## 1. Add an ingress rule to your existing tunnel

Edit your tunnel config (e.g. `/etc/cloudflared/config.yml`) and add the hostname **above** the
catch-all rule:

```yaml
ingress:
  - hostname: secretsanta.example.com
    service: http://localhost:3001
  # ... your other hostnames ...
  - service: http_status:404
```

Route DNS and restart:

```bash
cloudflared tunnel route dns <your-tunnel> secretsanta.example.com
sudo systemctl restart cloudflared
```

## 2. Cloudflare Access (organiser/admin login)

Zero Trust → Access → Applications → Add → **Self-hosted**:

- **Application domains:** add `secretsanta.example.com/admin` **and** `secretsanta.example.com/organiser`
  (leave `/` and `/m/*` public — members must not be asked to log in).
- **Policy:** Allow, login method **One-time PIN**.
- Copy the application **AUD tag** + your **team domain** into `.env`
  (`CF_ACCESS_AUD`, `CF_ACCESS_TEAM_DOMAIN`).

## 3. Resend

Verify **`secretsanta.example.com`** (or a subdomain) as a sender in Resend, then set
`RESEND_API_KEY` and `MAIL_FROM=Secret Santa <no-reply@secretsanta.example.com>` in `.env`.

## 4. Edge protection (recommended)

Turnstile widget (put keys in `.env`), Bot Fight Mode, managed WAF, and a rate-limit rule on
`POST /organiser/request` and `POST /m/*`.
