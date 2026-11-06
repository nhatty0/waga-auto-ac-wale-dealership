# AutoShowroom Ethiopia — Strategic Architecture & Roadmap

## 1. Project Overview & Commercial Strategy

A production-ready digital showroom platform designed for car dealerships and vehicle importers in Addis Ababa, Ethiopia.

### The Business Strategy

- **Base Architecture**: Multi-Tenant SaaS core (One unified backend and database supporting isolated dealerships).
- **Client Flexibility**:
  - Standard Client: Multi-Tenant instance with custom subdomain or URL scoping (`?dealer=slug`), scoped dashboard, and isolated Telegram bot routing.
  - Enterprise Client: Single-Tenant standalone clone with full repository isolation, dedicated VPS/database, and custom feature sets.

---

## 2. Completed MVP Features (Baseline Demo)

- [x] **Custom Payment Splits**: Upfront Cash (_በእጅ የሚከፈል_) vs. Active Bank Loan Transfer (_የባንክ ዕዳ_) tracking.
- [x] **Status Badging & Lead Recovery**: Available, Reserved (_ተይዟል_), Sold (_ተሽጧል_), and In Transit (_በመንገድ ላይ_). Sold cars route to Telegram with automated "Find Me Similar" (_ተመሳሳይ ፈልግልኝ_) lead recovery.
- [x] **Showroom Filter Toggle**: Seamless client-side Show/Hide toggle for sold units.
- [x] **Plate Classification Tags**: _ያልተለጠፈ (Direct Import / Unregistered)_, _ኮድ 2 (Private)_, and _ኮድ 3 (Commercial)_ with Amharic/English badge display.
- [x] **Side-by-Side Comparison Dock**: Mobile-first dock comparing 2 vehicles across financial split, legal status, and powertrain specs.
- [x] **Lot Window Spec Sheet Generator**: One-click printable A4 window sticker with dealership branding, specs, financial split, and dynamic QR code routing.
- [x] **Advanced Showroom Filter Drawer**: Interactive slide-out drawer filtering by budget brackets, bank loan availability, plate code, fuel type, and transmission.

---

## 3. Multi-Tenant SaaS Architecture (Completed)

### Phase 1: Authentication & Backend API Hardening

- [x] Eliminate front-end PIN checks (`sessionStorage`).
- [x] Introduce Phone + OTP authentication engine with Ethiopian number normalization.
- [x] Enforce long-lived JWT authentication on `/api/admin/*` endpoints.

### Phase 2: Multi-Tenant Data Isolation

- [x] Create `dealerships` table and link foreign keys to `users`, `vehicles`, and `appointments`.
- [x] Auto-seed default tenant (`elite-motors`) preserving existing MVP records.
- [x] Scope all admin queries and mutations strictly by `current_user.dealership_id`.
- [x] Enable dynamic public showroom scoping via `?dealer=<slug>`.

### Phase 3: Dynamic Branding & Isolated Telegram Dispatch

- [x] Add Admin Settings tab (ማስተካከያ) for updating showroom profile and Telegram bot credentials.
- [x] Support direct logo upload with an elegant default car emblem fallback.
- [x] Implement self-onboarding for new phone registrations into dedicated tenants.
- [x] Scope Telegram appointment and inquiry alerts dynamically to each dealership's bot credentials.

### Phase 4: Cloud Media Storage & Image Optimization

- [x] Built server-side image compression pipeline using Pillow (max 1600px width, WebP format, quality=80).
- [x] Added pluggable cloud storage adapter (`storage.py`) supporting local storage fallback and S3/Cloudflare R2.
- [x] Added "View My Showroom / የእኔን ሾውሩም እይ" direct link in the Admin navigation.

---

## 4. Upcoming Production Phases

- [ ] **Dynamic OpenGraph / Telegram Rich Previews**: Enable shareable vehicle cards with photos and price tags on Telegram.
- [ ] **Production Cloud Deployment**: Next.js on Vercel/VPS, FastAPI on Render/Railway/VPS, and Cloudflare R2 bucket connection.
- [ ] **SuperAdmin Monitoring Portal**: Master dashboard for tracking platform-wide dealer counts, listing counts, and lead metrics.
