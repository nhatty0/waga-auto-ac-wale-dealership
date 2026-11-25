# Deploying AC WALE MARKET on Yegara cPanel

Replace these placeholders everywhere below:

| Placeholder | Example | Where to find it |
|---|---|---|
| `CPANELUSER` | `acwaleba` | cPanel right sidebar → "Current User" |
| `acwale.et` | `acwalecarmarket.com` | the domain you bought |

**Layout**

| Part | URL | cPanel tool | Folder on server |
|---|---|---|---|
| Next.js frontend | `https://acwale.et` | Setup Node.js App | `~/acwale_frontend` |
| FastAPI backend | `https://api.acwale.et/v1` | Setup Python App | `~/repos/waga-auto-ac-wale-dealership/backend` |
| SQLite DB + photos | – | File Manager | `~/acwale_data` |

The browser only talks to `acwale.et`. Next.js forwards `/api/*`, `/static/*` and `/uploads/*` to the
backend at `api.acwale.et/v1`, so there is no CORS or mixed-content trouble.

---

## 0. Before anything: security clean-up (repo is public)

1. **Revoke the Telegram bot token** that was in `handoff.md`: open @BotFather in Telegram → `/mybots` →
   your bot → *API Token* → *Revoke current token*. Use the new token in step 3.
   (It is removed from the file now, but it stays in Git history forever.)
2. Commit and push these changes to GitHub.

## 1. Domain, subdomain, SSL

1. cPanel → **Domains** → **Create A New Domain** → `api.acwale.et`
   - Uncheck "Share document root"; document root: `api.acwale.et`
2. cPanel → **SSL/TLS Status** → select all → **Run AutoSSL**. Wait until `acwale.et`, `www.acwale.et`,
   `api.acwale.et` all show a green padlock (can take ~15 min after DNS points to Yegara).
3. cPanel → **Domains** → toggle **Force HTTPS Redirect** ON for all of them.

## 2. Data folders

cPanel → **File Manager** → home folder → create:

```
acwale_data/
acwale_data/static/
acwale_data/static/uploads/
```

Permissions 755 (default). Never 777. If you have an existing database or photos from another server,
upload the `.db` file as `acwale_data/ac_wale_cars.db` and the photos into `acwale_data/static/uploads/`.

## 3. Backend (Setup Python App)

**3a. Get the code.** cPanel → **Git™ Version Control** → **Create**
- Clone URL: `https://github.com/nhatty0/waga-auto-ac-wale-dealership.git`
- Repository Path: `repos/waga-auto-ac-wale-dealership`
- Repository Name: `acwale`

**3b. Create the app.** cPanel → **Setup Python App** → **Create Application**

| Field | Value |
|---|---|
| Python version | highest offered (3.11+ preferred, 3.10 minimum) |
| Application root | `repos/waga-auto-ac-wale-dealership/backend` |
| Application URL | `api.acwale.et` + path `v1` (the root `/` did not work on Yegara) |
| Application startup file | `passenger_wsgi.py` |
| Application Entry point | `application` |
| Passenger log file | `/home/CPANELUSER/logs/acwale-api.log` |

Click **Create**.

**3b-2. Unlock the folders (REQUIRED).** cPanel's Git tool creates `repos/` with permission 700, which
makes LiteSpeed answer every request with its own 404 without ever starting the app. In Terminal:

```
chmod 755 ~/repos ~/repos/waga-auto-ac-wale-dealership ~/repos/waga-auto-ac-wale-dealership/backend
```

If cPanel replaced `backend/passenger_wsgi.py` with its own template (it contains `load_source`), run
`cd ~/repos/waga-auto-ac-wale-dealership && git checkout -- backend/passenger_wsgi.py`.

**3c. Environment file.** File Manager → `repos/waga-auto-ac-wale-dealership/backend/` →
copy `.env.cpanel.example` to `.env` → Edit → fill in `CPANELUSER`, domain, `JWT_SECRET_KEY`,
the **new** Telegram token, AfroMessage token. The app refuses to start without a real `JWT_SECRET_KEY`. Then `chmod 600 .env`.

**3d. Install packages.** Back in Setup Python App → your app → "Configuration files" →
type `requirements-cpanel.txt` → **Add** → **Run Pip Install**.

(Terminal alternative: copy the `source …/activate` command shown at the top of the app page, then
`cd ~/repos/waga-auto-ac-wale-dealership/backend && pip install -r requirements-cpanel.txt`)

**3e. Start.** In Terminal:
`cloudlinux-selector restart --json --interpreter python --app-root repos/waga-auto-ac-wale-dealership/backend`
Open `https://api.acwale.et/v1/docs` — the Swagger page should load; `https://api.acwale.et/v1/api/vehicles` returns JSON.
The database file `~/acwale_data/ac_wale_cars.db` is created automatically on first request.
If you get an error page, read `backend/app_debug.log`.

**3f. Telegram webhook** (replaces the background poller, which cannot run on shared hosting).
The webhook carries everything the bot does: staff `/start link_…` links, the owner's Connect Bot link,
the driver's `/start gp_…` link, and the gate pass **Confirm exit / Reject** buttons (`callback_query`).
Without `callback_query` in `allowed_updates` the buttons spin and nothing is recorded.

Production `.env` needs (add once, keep the values private):

| Variable | Value |
|---|---|
| `TELEGRAM_PLATFORM_BOT_TOKEN` | the client's bot token (from @BotFather) |
| `TELEGRAM_PLATFORM_BOT_USERNAME` | the bot's username without `@` (used in t.me links) |
| `TELEGRAM_WEBHOOK_SECRET` | a long random string, e.g. `python -c "import secrets;print(secrets.token_urlsafe(32))"` |
| `PUBLIC_SITE_URL` | `https://acwalecarmarket.com` (verify links in Telegram messages; this is the default) |

Restart the Python app after editing `.env`. Then open this in a browser once (one line; replace
`<TOKEN>` and `<SECRET>`; the `allowed_updates` part is `["message","callback_query"]` URL-encoded):

```
https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://api.acwalecarmarket.com/v1/api/telegram/webhook&secret_token=<SECRET>&allowed_updates=%5B%22message%22%2C%22callback_query%22%5D&drop_pending_updates=true
```

It should answer `{"ok":true,"result":true,"description":"Webhook was set"}`.

Check it any time with `https://api.telegram.org/bot<TOKEN>/getWebhookInfo`: `url` must be the address
above, `allowed_updates` must list `message` and `callback_query`, and `last_error_message` should be
empty. A `403` there means the secret in `.env` and in setWebhook differ: run setWebhook again.
Re-run setWebhook whenever the token, the secret or the API domain changes.

**Local development uses a separate test bot.** Telegram can't reach `localhost`, so
`.\dev.ps1 start -Telegram` long-polls (`getUpdates`) with the token in `backend\.env`. Polling is
refused (HTTP 409) for a bot that has a webhook, so never point your local `.env` at the client's bot
and never call `deleteWebhook` on it. The webhook and the poller run the same code
(`gate_pass.process_update`).

**Security note (this release).** The old `/start link_<phone>` link was removed: it linked any
Telegram chat to any phone number and sent that phone's login code into it. `/start connect_<id>` was
removed for the same reason. Staff and the owner now link Telegram with one-time links (48 h) from
`/superadmin` (Staff → Link Telegram, and the Connect Bot button). Chats linked before stay linked;
if you are unsure who linked a chat in the past, unlink it in Staff and send a new link.

## 4. Frontend (build on your PC, run on Setup Node.js App)

**4a. Check Node version on Yegara first:** cPanel → Setup Node.js App → Create → Node.js version list.
Next.js 16 needs **20.9 or newer**. Use the same major version on your PC.

**4b. Build on your PC:**

```bash
cd frontend
cp .env.production.example .env.production     # then edit: put your real domain
npm ci
npm run build:cpanel
```

Build only after step 3 works (pages fetch from `https://api.acwale.et` during the build).
Then zip the **contents** of `frontend/.next/standalone/` (open the folder, select all, zip) →
`frontend-build.zip`. `server.js` must be at the top of the zip, not inside a sub-folder.

**4c. Upload.** File Manager → create `acwale_frontend/` → upload `frontend-build.zip` → **Extract** → delete the zip.

**4d. Create the app.** cPanel → **Setup Node.js App** → **Create Application**

| Field | Value |
|---|---|
| Node.js version | 20.x or 22.x (≥ 20.9) |
| Application mode | Production |
| Application root | `acwale_frontend` |
| Application URL | `acwale.et` |
| Application startup file | `server.js` |

Environment variables (Add Variable):

| Name | Value |
|---|---|
| `NODE_ENV` | `production` |
| `INTERNAL_API_URL` | `https://api.acwale.et/v1` |
| `NEXT_PUBLIC_SITE_URL` | `https://acwale.et` |

Click **Create** → **Restart**. **Do NOT click "Run NPM Install"** — the standalone bundle already
contains its node_modules.

**4e. www.** cPanel → **Domains** → Redirects → `www.acwale.et` → `https://acwale.et` (permanent 301).

## 5. Checks

- [ ] `https://acwale.et` loads, Amharic/English toggle works, Buy & Rent catalogs show cars
- [ ] `https://acwale.et/api/vehicles` returns JSON (goes through the frontend → backend)
- [ ] Log in at `/admin` with OTP (SMS or Telegram arrives)
- [ ] Upload a vehicle photo → file appears in `~/acwale_data/static/uploads/` and shows on the site
- [ ] Create a test-drive booking → Restart the Python app → booking still there
- [ ] Browser DevTools Console: no "Mixed Content" errors
- [ ] Print a flyer, gate pass, and handover contract; Amharic text renders

## 6. Backups (cPanel → Cron Jobs)

Once a day, 02:00, keeps 7 rolling copies:

```
0 2 * * * cp /home/CPANELUSER/acwale_data/ac_wale_cars.db /home/CPANELUSER/acwale_data/backup-$(date +\%a).db
```

Also download `acwale_data/` to your PC monthly.

## 7. Updating later

- **Backend:** Git Version Control → Manage → Pull or Deploy → **Update from Remote** → re-run the `chmod 755` line from 3b-2 → restart (3e)
  (Run Pip Install again only if `requirements-cpanel.txt` changed.)
- **Frontend:** on your PC `npm run build:cpanel` → zip → upload & extract over `acwale_frontend/` → **Restart**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `JWT_SECRET_KEY is missing…` in `app_debug.log` | Fill `JWT_SECRET_KEY` in `backend/.env`, Restart |
| `No module named …` | Run Pip Install again; check the Python version |
| `database is locked` | Should not happen (WAL mode on); make sure only one Python app uses the DB |
| Photos 404 | Check `STATIC_ROOT` in `.env` and that files are in `acwale_data/static/uploads/` |
| LiteSpeed black 404 page on every API URL | Folder permissions (3b-2) or cPanel template in `passenger_wsgi.py` |
| "Request Timeout" 500 | Old `passenger_wsgi.py` without the per-worker bridge; restore it from Git |
| Frontend 503 / "Incomplete response" | Wrong Node version or out of memory: cPanel → Resource Usage |
| Telegram /start links do nothing | Re-run setWebhook (3f); check secret matches `.env` |
| Gate pass buttons spin / do nothing | `allowed_updates` lacks `callback_query`: re-run setWebhook (3f) |
| "Not authorized" on Confirm exit | That Telegram is not linked to an ACTIVE staff member with the Gate permission |
