# AutoShowroom / Elite Motors — GoDaddy Production Deployment & Handoff Guide

This guide provides end-to-end instructions for deploying and hosting the **AutoShowroom / Elite Motors** multi-tenant platform on **GoDaddy**.

---

## 1. System Architecture Overview

The platform is composed of three interconnected services:

```
[ GoDaddy Domain / DNS ] (e.g., yourdomain.com)
            │
            ▼
[ Nginx Reverse Proxy + Let's Encrypt SSL (Port 80/443) ]
     │                                     │
     ├─► / (Frontend)                      ├─► /api/* & /uploads/* (Backend)
     │   Next.js 16 (App Router)           │   FastAPI (ASGI)
     │   Managed by PM2 (Port 3000)        │   Managed by PM2 (Port 8000)
     │                                     │
     ▼                                     ▼
[ Client Browser ]                   [ PostgreSQL 15/16 Database ] (Port 5432)
                                           │
                                           ├─► AfroMessage SMS Gateway (Phone OTPs)
                                           ├─► Multi-Tenant Telegram Alert Bot
                                           └─► Local WebP Storage / Cloudflare R2 / S3
```

- **Frontend**: Next.js 16 (React 19, TypeScript, Tailwind CSS, App Router) running on Node.js 20 LTS.
- **Backend**: FastAPI (Python 3.10+) running with Uvicorn ASGI server.
- **Database**: PostgreSQL (multi-tenant schema with automated migrations).
- **External Integrations**:
  - **AfroMessage SMS Gateway**: Dispatches secure 6-digit OTPs to Ethiopian phone numbers (`09...`, `07...`, `+2519...`).
  - **Telegram Bot API**: Deep-linking authentication & dynamic tenant-isolated lead alerts.
  - **Image Pipeline**: Pillow WebP image compression with optional S3/Cloudflare R2 storage.

---

## 2. Choosing the Right GoDaddy Hosting Tier

| Feature | GoDaddy Linux VPS (Recommended) | GoDaddy Shared / cPanel Hosting |
| :--- | :--- | :--- |
| **Compatibility** | **100% Native Support** | Limited (Requires Passenger WSGI hacks) |
| **Persistent Processes** | Native (PM2 / Systemd keeps Uvicorn & Next.js running 24/7) | Shared process killers terminate background workers |
| **PostgreSQL** | Full root control over PostgreSQL 15/16 | Typically MySQL only; PostgreSQL rarely enabled |
| **Background Daemons** | Supports Telegram polling worker & async tasks | Background polling frequently killed by cron throttles |
| **SSL Management** | Free auto-renewing Let's Encrypt SSL via Certbot | Often requires purchasing GoDaddy proprietary SSL |
| **Verdict** | **STRONGLY RECOMMENDED for Production** | Not recommended for multi-tenant SaaS |

> [!IMPORTANT]
> **Recommended Server Specs**: GoDaddy **Standard RAM Linux VPS (Tier 2 or higher)**:
> - **OS**: Ubuntu 22.04 LTS or Ubuntu 24.04 LTS
> - **CPU**: 2 vCPUs minimum
> - **RAM**: 4 GB RAM minimum (Next.js build & Pillow image compression require at least 2GB free RAM)
> - **Storage**: 40 GB+ NVMe SSD

---

## 3. Step 1: GoDaddy DNS Configuration

1. Log into your **GoDaddy Domain Control Center**.
2. Select your domain (e.g., `yourdomain.com`) and navigate to **Manage DNS**.
3. Point your records to your **GoDaddy VPS Public IP Address** (`YOUR_VPS_IP`):

| Type | Name | Value | TTL | Purpose |
| :--- | :--- | :--- | :--- | :--- |
| **A** | `@` | `YOUR_VPS_IP` | 600 seconds | Root domain (`yourdomain.com`) |
| **A** | `www` | `YOUR_VPS_IP` | 600 seconds | Subdomain (`www.yourdomain.com`) |
| **A** | `api` | `YOUR_VPS_IP` | 600 seconds | Optional dedicated API subdomain |

> [!TIP]
> Setting TTL to 600 seconds (10 minutes) ensures rapid DNS propagation while setting up SSL certificates.

---

## 4. Step 2: VPS Server Provisioning & Dependencies

Connect to your GoDaddy VPS via SSH:
```bash
ssh root@YOUR_VPS_IP
```

### 4.1 Update System Packages & Install Core Tools
```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y curl wget git build-essential libpq-dev ufw nginx certbot python3-certbot-nginx
```

### 4.2 Configure UFW Firewall
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow OpenSSH
sudo ufw allow 'Nginx Full'
sudo ufw enable -y
```

### 4.3 Install Node.js 20 LTS & PM2
```bash
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2
node -v   # Should output v20.x.x
npm -v    # Should output v10.x.x
```

### 4.4 Install Python 3.11+ & Virtual Environment
```bash
sudo apt install -y python3 python3-pip python3-venv
python3 --version
```

### 4.5 Install & Configure PostgreSQL
```bash
sudo apt install -y postgresql postgresql-contrib
sudo systemctl enable postgresql
sudo systemctl start postgresql
```

---

## 5. Step 3: Database Setup

Log into PostgreSQL and create the production database and user:

```bash
sudo -u postgres psql
```

Execute the following SQL commands (replace `StrongPassword2026!` with a secure password):

```sql
CREATE DATABASE elite_motors_db;
CREATE USER elite_user WITH ENCRYPTED PASSWORD 'StrongPassword2026!';
GRANT ALL PRIVILEGES ON DATABASE elite_motors_db TO elite_user;
ALTER DATABASE elite_motors_db OWNER TO elite_user;
\c elite_motors_db
GRANT ALL ON SCHEMA public TO elite_user;
\q
```

Verify the connection:
```bash
psql -U elite_user -d elite_motors_db -h 127.0.0.1 -W
# Enter your password when prompted, then type \q to exit.
```

---

## 6. Step 4: Clone Codebase & Setup Backend

### 6.1 Clone the Repository
```bash
sudo mkdir -p /var/www/elite-motors
sudo chown -R $USER:$USER /var/www/elite-motors
git clone https://github.com/nhatty0/elite-motors.git /var/www/elite-motors
cd /var/www/elite-motors/backend
```

### 6.2 Setup Python Virtual Environment & Install Dependencies
```bash
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt
```

### 6.3 Configure Backend Environment Variables
Create the production environment file:
```bash
nano /var/www/elite-motors/backend/.env
```

Paste and customize your production credentials:
```ini
# Database Connection (local PostgreSQL)
DATABASE_URL=postgresql+psycopg2://elite_user:StrongPassword2026!@127.0.0.1:5432/elite_motors_db
PORT=8000

# Security & JWT Token Generation (Generate with: openssl rand -hex 32)
JWT_SECRET_KEY=paste_a_secure_64_character_random_hex_key_here

# SuperAdmin Phone (Platform Owner - full master access)
SUPERADMIN_PHONE=251918032065

# AfroMessage SMS Gateway (Ethiopian Mobile OTPs)
AFROMESSAGE_API_TOKEN=your_live_afromessage_api_token_here
AFROMESSAGE_SENDER_NAME=AutoShowroom
ENABLE_SMS_DISPATCH=true

# Telegram Alert Bot (Platform Default Bot)
TELEGRAM_BOT_TOKEN=8842269092:AAHpgX-bHSYbshS0k2ncUoDYyrxYR2evpjM
TELEGRAM_CHAT_ID=371550151
TELEGRAM_BOT_USERNAME=EliteMotorsAlert_bot

# Optional Cloudflare R2 / AWS S3 Cloud Storage (leave false for local WebP storage)
USE_S3_STORAGE=false
S3_BUCKET_NAME=
S3_ENDPOINT_URL=
S3_ACCESS_KEY=
S3_SECRET_KEY=
S3_PUBLIC_CUSTOM_DOMAIN=
```

### 6.4 Execute Multi-Tenant Database Migrations
```bash
python migrate.py
```
*Expected output:*
```
🔄 Running database migrations...
✓ Seeded default dealership: 'Elite Motors Addis' (ID: 1)
✓ Backfilled default dealership ID 1
✓ Migration completed successfully!
```

---

## 7. Step 5: Build Next.js Frontend

### 7.1 Navigate & Configure Production API URL
```bash
cd /var/www/elite-motors/frontend
nano .env.production
```

Add your production URL configuration:
```ini
# When deployed behind Nginx, relative path or full domain routes to the reverse proxy
NEXT_PUBLIC_API_URL=https://yourdomain.com
```

### 7.2 Install Frontend Dependencies & Build
```bash
npm install
npm run build
```
*Verify that `npm run build` completes successfully with 0 TypeScript or build errors.*

---

## 8. Step 6: Process Management with PM2

We will use **PM2** to run both the FastAPI backend and Next.js frontend as persistent services that automatically restart upon server reboot or unexpected failure.

### 8.1 Create Ecosystem Configuration File
```bash
cd /var/www/elite-motors
nano ecosystem.config.js
```

Paste the following PM2 configuration:

```javascript
module.exports = {
  apps: [
    {
      name: "elite-backend",
      cwd: "/var/www/elite-motors/backend",
      script: "/var/www/elite-motors/backend/venv/bin/uvicorn",
      args: "main:app --host 127.0.0.1 --port 8000 --workers 3",
      interpreter: "none",
      env: {
        NODE_ENV: "production",
      },
      restart_delay: 4000,
      max_restarts: 10,
    },
    {
      name: "elite-frontend",
      cwd: "/var/www/elite-motors/frontend",
      script: "node_modules/next/dist/bin/next",
      args: "start -p 3000",
      env: {
        NODE_ENV: "production",
        PORT: 3000,
      },
      restart_delay: 4000,
      max_restarts: 10,
    },
  ],
};
```

### 8.2 Start Applications & Enable Auto-Restart on Boot
```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
# Copy and execute the sudo env command generated by 'pm2 startup'
```

### 8.3 Verify Services are Running
```bash
pm2 status
```
Both `elite-backend` and `elite-frontend` should display status **online**.

---

## 9. Step 7: Nginx Reverse Proxy & Let's Encrypt SSL

### 9.1 Create Nginx Site Configuration
```bash
sudo nano /etc/nginx/sites-available/elite-motors
```

Paste the following production Nginx configuration (replace `yourdomain.com` with your actual GoDaddy domain):

```nginx
server {
    listen 80;
    server_name yourdomain.com www.yourdomain.com;

    # Maximum file upload size for vehicle photography
    client_max_body_size 50M;

    # Gzip Compression for fast delivery across Ethiopian networks
    gzip on;
    gzip_types text/plain text/css application/json application/javascript text/xml application/xml application/xml+rss text/javascript image/svg+xml;

    # 1. FastAPI Backend API Endpoints
    location /api/ {
        proxy_pass http://127.0.0.1:8000/api/;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 90;
    }

    # 2. Local WebP Uploads Directory
    location /uploads/ {
        proxy_pass http://127.0.0.1:8000/uploads/;
        proxy_set_header Host $host;
        expires 30d;
        add_header Cache-Control "public, no-transform";
    }

    # 3. Next.js Frontend Application
    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### 9.2 Enable the Site & Test Nginx Configuration
```bash
sudo ln -s /etc/nginx/sites-available/elite-motors /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t
sudo systemctl reload nginx
```

### 9.3 Obtain Free Let's Encrypt SSL Certificate
```bash
sudo certbot --nginx -d yourdomain.com -d www.yourdomain.com
```
*Select option 2 to automatically redirect all HTTP traffic to HTTPS.*

Certbot sets up an automatic renewal timer. Verify it with:
```bash
sudo systemctl status certbot.timer
```

---

## 10. Step 8: Multi-Tenant & AfroMessage Production Verification Checklist

Run through these checks in your browser and terminal once deployment is live:

- [ ] **Public Digital Showroom Scoping**:
  - Visit `https://yourdomain.com/?dealer=elite-motors` — verifies default tenant loads.
  - Visit `https://yourdomain.com` — defaults to primary showroom without errors.
- [ ] **AfroMessage SMS OTP Authentication**:
  - Go to `https://yourdomain.com/admin`.
  - Enter an Ethiopian mobile number (`09...` or `07...`).
  - Click **ኮድ ላክ (Send Code)**.
  - **Security Check**: Open Chrome DevTools (`F12` -> Network tab -> `request-otp` response). Verify that `otp_code` and `otp_display` are **NOT** present in the JSON payload.
  - Check the incoming SMS on your physical mobile phone:
    > *የአውቶ ሾውሩም ማረጋገጫ ኮድዎ: XXXXXX ነው። በ 3 ደቂቃ ውስጥ ይጠቀሙበት። (AutoShowroom Code: XXXXXX)*
  - Verify that the 60-second cooldown timer is active on the `"Resend SMS / ኮድ በድጋሚ ላክ"` button.
- [ ] **Dynamic Admin Back Navigation**:
  - Once logged into `/admin`, locate the back arrow (`←`) next to **"Dealership Management"**.
  - Click the back arrow — verify it returns to `/?dealer=<your-dealership-slug>`, not hardcoded `/`.
- [ ] **Vehicle Image WebP Compression**:
  - In Admin Inventory, click **"Add Vehicle"** and upload a large JPEG/PNG image (3MB+).
  - Verify that the image saves as an optimized `.webp` file under `/uploads/` (typically 80-90% size reduction).
- [ ] **Tenant Telegram Isolation**:
  - In Admin **Settings (ማስተካከያ)**, update the dealership's Telegram Bot Token & Chat ID.
  - Click **"Test Telegram Connection"** — verify notification is delivered strictly to that dealership's chat, with zero cross-tenant bleeding.
- [ ] **SuperAdmin Master Portal**:
  - Log in with the phone number set in `SUPERADMIN_PHONE`.
  - Visit `https://yourdomain.com/superadmin` — verify global platform stats, monetization plan toggles, and dealership suspension switches.

---

## 11. Step 9: Automated Database Backups & Maintenance

### 11.1 Create Automated Backup Script
```bash
sudo mkdir -p /var/backups/postgres
sudo nano /usr/local/bin/backup-elite-db.sh
```

Paste:
```bash
#!/bin/bash
BACKUP_DIR="/var/backups/postgres"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
FILENAME="$BACKUP_DIR/elite_motors_$TIMESTAMP.sql.gz"

# Perform compressed dump
sudo -u postgres pg_dump elite_motors_db | gzip > "$FILENAME"

# Retain backups for 14 days, delete older
find "$BACKUP_DIR" -type f -name "*.sql.gz" -mtime +14 -exec rm {} \;

echo "Backup completed: $FILENAME"
```

Make it executable:
```bash
sudo chmod +x /usr/local/bin/backup-elite-db.sh
```

### 11.2 Add Nightly Cron Job
```bash
sudo crontab -e
```
Add the following line to run every night at 2:00 AM:
```cron
0 2 * * * /usr/local/bin/backup-elite-db.sh >> /var/log/db_backup.log 2>&1
```

---

## 12. Step 10: Routine Operational Commands

### View Live Logs
```bash
pm2 logs elite-backend    # View FastAPI & AfroMessage SMS dispatch logs
pm2 logs elite-frontend   # View Next.js SSR & client request logs
sudo tail -f /var/log/nginx/error.log  # View Nginx errors
```

### Restart Services
```bash
pm2 restart elite-backend
pm2 restart elite-frontend
sudo systemctl reload nginx
```

### Deploying Code Updates (CI/CD Routine)
Whenever you push updates to GitHub, run this on the VPS:
```bash
cd /var/www/elite-motors

# 1. Pull latest code
git pull origin main

# 2. Update Backend
cd backend
source venv/bin/activate
pip install -r requirements.txt
python migrate.py

# 3. Update Frontend
cd ../frontend
npm install
npm run build

# 4. Restart services with 0 downtime
pm2 restart all
```

---

## 13. Troubleshooting Guide

| Issue | Root Cause | Solution |
| :--- | :--- | :--- |
| **502 Bad Gateway** | FastAPI or Next.js service is down | Run `pm2 status` to identify which service failed. Check `pm2 logs` for tracebacks. |
| **SMS OTP Not Delivered** | `AFROMESSAGE_API_TOKEN` invalid or out of credits | Check `pm2 logs elite-backend` for AfroMessage API HTTP codes. Verify account balance at [afromessage.com](https://afromessage.com). |
| **Phone number rejected** | Number format not recognized | Must be a valid Ethiopian 10-digit (`09...`, `07...`) or international format (`+2519...`). |
| **Vehicle photo upload fails** | File exceeds Nginx limit | Ensure `client_max_body_size 50M;` is present in `/etc/nginx/sites-available/elite-motors`. |
| **Telegram test fails** | Bot token or chat ID incorrect | Verify bot token from `@BotFather` and ensure user has pressed `/start` in the bot chat. |
