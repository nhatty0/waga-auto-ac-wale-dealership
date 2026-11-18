# Deploying AC WALE MARKET on Yegara cPanel

Replace these placeholders everywhere below:

| Placeholder | Example | Where to find it |
|---|---|---|
| `CPANELUSER` | `acwalet1` | cPanel right sidebar → "Current User" |
| `acwale.et` | your domain | the domain you bought |

**Layout**

| Part | URL | cPanel tool | Folder on server |
|---|---|---|---|
| Next.js frontend | `https://acwale.et` | Setup Node.js App | `~/acwale_frontend` |
| FastAPI backend | `https://api.acwale.et` | Setup Python App | `~/repos/waga-auto-ac-wale-dealership/backend` |
| SQLite DB + photos | – | File Manager | `~/acwale_data` |

The browser only talks to `acwale.et`. Next.js forwards `/api/*`, `/static/*` and `/uploads/*` to the
backend at `api.acwale.et`, so there is no CORS or mixed-content trouble.

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
| Application URL | `api.acwale.et` (path empty) |
| Application startup file | `passenger_wsgi.py` |
| Application Entry point | `application` |
| Passenger log file | `/home/CPANELUSER/logs/acwale-api.log` |

Click **Create**.

**3c. Environment file.** File Manager → `repos/waga-auto-ac-wale-dealership/backend/` →
copy `.env.cpanel.example` to `.env` → Edit → fill in `CPANELUSER`, domain, `JWT_SECRET_KEY`,
the **new** Telegram token, AfroMessage token. The app refuses to start without a real `JWT_SECRET_KEY`.

**3d. Install packages.** Back in Setup Python App → your app → "Configuration files" →
type `requirements-cpanel.txt` → **Add** → **Run Pip Install**.

(Terminal alternative: copy the `source …/activate` command shown at the top of the app page, then
`cd ~/repos/waga-auto-ac-wale-dealership/backend && pip install -r requirements-cpanel.txt`)

**3e. Start.** Click **Restart**. Open `https://api.acwale.et/docs` — the Swagger page should load.
The database file `~/acwale_data/ac_wale_cars.db` is created automatically on first request.
If you get an error page, read `~/logs/acwale-api.log`.

**3f. Telegram webhook** (replaces the background poller, which cannot run on shared hosting).
Open this in a browser once, with your NEW token and the `TELEGRAM_WEBHOOK_SECRET` from `.env`:

```
https://api.telegram.org/bot<NEW_TOKEN>/setWebhook?url=https://api.acwale.et/api/telegram/webhook&secret_token=<TELEGRAM_WEBHOOK_SECRET>
```

It should answer `{"ok":true,"result":true,"description":"Webhook was set"}`.

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
| `INTERNAL_API_URL` | `https://api.acwale.et` |
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

- **Backend:** Git Version Control → Manage → Pull or Deploy → **Update from Remote** → Setup Python App → **Restart**
  (Run Pip Install again only if `requirements-cpanel.txt` changed.)
- **Frontend:** on your PC `npm run build:cpanel` → zip → upload & extract over `acwale_frontend/` → **Restart**.

## Troubleshooting

| Symptom | Fix |
|---|---|
| `JWT_SECRET_KEY is missing…` in log | Fill `JWT_SECRET_KEY` in `backend/.env`, Restart |
| `No module named …` | Run Pip Install again; check the Python version |
| `database is locked` | Should not happen (WAL mode on); make sure only one Python app uses the DB |
| Photos 404 | Check `STATIC_ROOT` in `.env` and that files are in `acwale_data/static/uploads/` |
| Frontend 503 / "Incomplete response" | Wrong Node version or out of memory: cPanel → Resource Usage |
| Telegram /start links do nothing | Re-run setWebhook (3f); check secret matches `.env` |
