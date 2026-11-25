# Waga Dealership Hub — Architecture, Codebase & Handoff Guide (CLAUDE.md)

This handoff document is prepared for **Claude** (and other senior AI engineers) to continue developing, maintaining, and extending the **Waga Dealership Hub** multi-tenant platform.

---

## 1. System Overview

- **Product**: Waga Dealership Hub (ዋጋ Dealership Hub / ዋጋ የዲጂታል ሾውሩም መድረክ) — A multi-tenant SaaS digital showroom and lot-management platform for car dealerships in Addis Ababa, Ethiopia.
- **Frontend**: Next.js 16.4 (App Router, Turbopack, React 19, TypeScript, Tailwind CSS v4, Framer Motion, Three.js, `@react-three/fiber`, `@react-three/drei`).
- **Backend**: FastAPI (Python 3.10+, SQLAlchemy, PostgreSQL, Uvicorn, Pillow WebP image compression).
- **Core Integrations**:
  - **AfroMessage SMS Gateway**: Dispatches 6-digit OTP codes to Ethiopian mobile numbers (`09...`, `07...`, `+251...`) with zero leaked codes in API responses.
  - **Telegram Bot API**: Deep-linked dealer notifications (`/start link_<phone>`) and automated lead recovery for sold vehicles.
  - **Cloud Media Pipeline**: Pluggable storage adapter supporting local WebP image storage and Cloudflare R2 / AWS S3.
  - **3D & Motion Engine**: WebGL Three.js PBR showroom canvas, interactive 360° turntable, and Framer Motion staggered transitions.

---

## 2. What Was Implemented (Recent Updates)

### A. AfroMessage SMS Gateway & Backend Settings
1. **`backend/settings.py`**:
   - Added optional `AFROMESSAGE_IDENTIFIER_ID: Optional[str] = (os.getenv("AFROMESSAGE_IDENTIFIER_ID") or "").strip() or None`.
   - Guaranteed automatic whitespace stripping on `AFROMESSAGE_API_TOKEN`.
   - Added `AFROMESSAGE_IDENTIFIER_ID=` to `backend/.env.example`.
2. **`backend/sms.py`**:
   - Upgraded to strictly adhere to the official AfroMessage API spec.
   - Strips `"Bearer "` prefix if accidentally included in `.env`.
   - Normalizes Ethiopian numbers (`+251...` and `251...` to standard 10-digit format `09...` or `07...`).
   - Supports both `sender` (`AFROMESSAGE_SENDER_NAME`) and `from` (`AFROMESSAGE_IDENTIFIER_ID`) payload fields.
   - Verifies `data.get("acknowledge") == "success"` and logs message IDs.
3. **`backend/test_afromessage_sms.py`**:
   - Updated integration test suite verifying mock mode, headers, payload structure, phone normalization, zero OTP leaks, and verification flow. All 7 tests pass.

### B. Cinematic 3D Showroom Hero Pro (`frontend/src/components/showroom3d/`)
1. **`ShowroomStage.tsx`**:
   - Environment lighting with 5 custom `Lightformer` soft-boxes that project studio light reflection strips along the clearcoat body curvature.
   - Dynamic `LightSweep` spotlight that animates across the vehicle hood and roof.
   - Dark glossy mirror floor using `MeshReflectorMaterial` on desktop, falling back to lightweight matte floor on mobile.
   - High-fidelity `ContactShadows` baked beneath wheels and underbody.
2. **`RealisticCar.tsx`**:
   - Loads real car GLB models with local Draco decoder (`/draco/`).
   - Automated regex material classification (`paint`, `glass`, `chrome`, `rubber`, `headlight`, `taillight`, `trim`) replacing arbitrary stock materials with automotive PBR materials.
   - Auto-orients models along the Z-axis, auto-scales to `targetLength` (4.2 units), and aligns wheels to `y = 0`.
   - Real-time paint color lerping with smooth exponential damping (`1 - Math.exp(-6 * dt)`).
3. **`CameraRig.tsx`**:
   - Smoothly glides the camera between cinematic viewpoints (**Overview**, **Front**, **Wheel**, **Cabin**) using damped interpolation.
   - Auto-rotates during overview idle and hands full orbit control over to the user upon touch or drag.
4. **`Hero3DCanvasPro.tsx`**:
   - Pre-flight HEAD check (`useModelAvailable`) verifying `/models/showroom_car.glb` availability before instantiating the 3D model, falling back to `ProceduralCarModel` if absent.
   - ACESFilmic tone mapping, sRGB color space output, context loss recovery, and frameloop throttling.
5. **Real 3D Model Asset**:
   - Sourced and installed realistic **Ferrari 458 Italia** GLB from the official Three.js repository (`frontend/public/models/showroom_car.glb`, 1.68 MB, Draco compressed).
   - Bundled local Draco decoder binaries in `frontend/public/draco/` for 100% offline, zero-CDN operation.

### C. Unified Platform Rebranding & SaaS Landing (`frontend/src/components/SaaSPlatformLanding.tsx`)
1. **Unified Rebranding to "Waga Dealership Hub"**:
   - Rebranded all platform-level headers, logos, metadata, and footer titles to "Waga Dealership Hub" (Amharic: "ዋጋ Dealership Hub" / "ዋጋ የዲጂታል ሾውሩም መድረክ").
   - Browser title: `Waga Dealership Hub | Addis Ababa Premier Automotive SaaS`.
   - Isolated from individual dealer showroom pages (`/?dealer=slug`), which continue to display each dealer's distinct brand, logo, and inventory.
2. **Infinite Brand Partner Marquee**:
   - Removed public dealer directory cards that exposed private numbers/inventories.
   - Replaced with continuous CSS ticker (`animate-marquee`) featuring premier Addis Ababa networks:
     * *Nyala Motors*, *KAKI Motors*, *Markon Car Importer*, *Bole Luxury Imports*, *Kerchanshe Auto*, *Addis Auto Gallery*.
3. **Tailored Pilot & Direct Sales Contact Section**:
   - Replaced fixed price cards with "Early Access Dealership Packages / ልዩ የጅምር አቅርቦት" spotlight section.
   - 5 Key Value Pillars (Brand Identity, Cash/Loan Debt Transfer, Real-time Telegram/SMS leads, Printable A4 QR sheets, WebP compression).
   - Direct CTA button linked to the primary dealership's phone (from the API; no numbers are hardcoded in UI code).
4. **Clean Navigation & Consolidated 2-Login Architecture**:
   - Top header: "Features", "Partners", "Contact", and single right button: "Dealer Login / መግቢያ" -> `/admin`.
   - Hero section: Single primary launch CTA -> `/admin`.
   - Footer: Discrete link "Dealer Portal / የአስተዳዳሪ መግቢያ" -> `/admin`.
   - Zero duplicate register/login buttons scattered in middle sections.

### D. Admin Dashboard Session Handling & Token Persistence (`frontend/src/app/admin/page.tsx`)
1. **Persistent Session Initialization**:
   - On component mount (`useEffect`), checks `localStorage.getItem("token")` (and fallback `dealer_token`).
   - If present, attaches `Authorization: Bearer ${token}` and fetches `GET /api/admin/dealership`.
   - If valid, sets authenticated dealer state, stores `dealership` in `localStorage`, and skips the login/OTP view completely.
   - If 401 or 403 (expired/revoked), cleans up `token` and `dealership` from `localStorage`, and resets to the phone login form.
2. **Explicit Logout Handler**:
   - Clears `token`, `dealer_token`, and `dealership` from `localStorage`, clears `sessionStorage`, and redirects to `/` via `router.push("/")`.
3. **30-Day Token Expiration (`backend/auth.py`, `backend/settings.py`)**:
   - `ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 30` (43,200 minutes / 30 days) to prevent daily OTP re-prompts for active dealership operators.

### E. Dynamic Showroom Animations (`frontend/src/components/DealerShowroomView.tsx`)
1. **Framer Motion Staggered Cards**:
   - Container stagger (`staggerChildren: 0.07`) and card variants (`hidden -> visible`).
   - Desktop hover lift & tilt: `whileHover={{ y: -6, scale: 1.015 }}` with amber border highlight.
   - Shared-element transition: `layoutId={`vehicle-card-${car.id}`}`.
2. **`AnimatedPrice.tsx`**:
   - Smooth count-up price animation in ETB.
   - Sequential reveal of Upfront Cash vs. Bank Loan transfer badges.
3. **Status Badges**:
   - `Reserved` receives an animated pulse (`animate-pulse`).
   - `Sold` routes to Telegram lead recovery ("Find Me Similar").
   - `Available` and `In Transit` clearly badged.
   - Plate tags (`ያልተለጠፈ / Unregistered`, `ኮድ 2 / Code 2`, `ኮድ 3 / Code 3`) preserved.
4. **Accessibility**:
   - Strict `prefers-reduced-motion` compliance across all motion elements.

### E. Vehicle Detail Viewer (Cascade Architecture)
1. **Cascade Logic**:
   - If `vehicle.model_url` exists: Renders **`Vehicle3DViewer.tsx`** (interactive 3D inspection).
   - Else if `vehicle.spin_images` has 12+ images: Renders **`VehicleSpinViewer.tsx`** (360° horizontal drag-spin with frame counter and buffer indicator).
   - Else: Gracefully falls back to existing photo gallery with zoom lightbox.
2. Integrated into:
   - **`frontend/src/app/vehicles/[id]/VehicleDetailClient.tsx`** (dedicated page).
   - **`frontend/src/components/VehicleModal.tsx`** (showroom quick-view modal).

---

## 3. Directory Layout & Key Files

```
elite-motors/
├── backend/
│   ├── auth.py                  # JWT tokens, OTP verification, rate limiting
│   ├── config.py                # Re-exports settings from settings.py
│   ├── database.py              # PostgreSQL SessionLocal & engine
│   ├── main.py                  # FastAPI endpoints & multi-tenant routing
│   ├── migrate.py               # Database migrations & default tenant backfill
│   ├── models.py                # SQLAlchemy models (Dealership, Vehicle, User, etc.)
│   ├── schemas.py               # Pydantic schemas
│   ├── settings.py              # Environment settings (AfroMessage, S3, Telegram)
│   ├── sms.py                   # AfroMessage SMS dispatch engine
│   ├── storage.py               # Pillow WebP optimization & S3/R2 storage adapter
│   └── test_*.py                # Automated backend test suites
│
└── frontend/
    ├── public/
    │   ├── draco/               # Local Draco WebAssembly decoders
    │   └── models/
    │       └── showroom_car.glb # Realistic Ferrari 458 Italia 3D model
    ├── src/
    │   ├── app/
    │   │   ├── globals.css      # Tailwind CSS v4 & infinite marquee keyframes
    │   │   ├── layout.tsx       # Root layout & Waga Dealership Hub metadata
    │   │   ├── page.tsx         # Root router (?dealer=<slug> vs SaaS Landing)
    │   │   ├── admin/page.tsx   # Dealership admin dashboard & inventory CRUD
    │   │   └── vehicles/[id]/   # Dedicated vehicle detail page & OpenGraph cards
    │   ├── components/
    │   │   ├── DealerShowroomView.tsx # Isolated dealer showroom (branding, filters, cars)
    │   │   ├── SaaSPlatformLanding.tsx# Standalone Waga Dealership Hub landing page
    │   │   ├── BookingModal.tsx # Test drive / video tour booking modal
    │   │   ├── CompareDock.tsx  # Floating 2-car comparison dock
    │   │   ├── CompareModal.tsx # Side-by-side spec comparison modal
    │   │   ├── FilterDrawer.tsx # Slide-out filter drawer (budget, plates, bank loan)
    │   │   ├── VehicleModal.tsx # Quick-view vehicle modal with 3D/360 cascade
    │   │   └── showroom3d/
    │   │       ├── AnimatedPrice.tsx       # Count-up price & financial split reveal
    │   │       ├── devicePerformance.ts   # Hardware/network detection & DPR capping
    │   │       ├── Hero3DCanvas.tsx        # Three.js WebGL canvas, lighting & controls
    │   │       ├── Hero3DCanvasPro.tsx     # Enhanced canvas with model verification
    │   │       ├── Hero3DPoster.tsx        # Instant LCP poster fallback (0.8s LCP)
    │   │       ├── Hero3DSection.tsx       # Dynamic hero section & color swatches
    │   │       ├── RealisticCar.tsx        # GLB model loader & PBR material swapper
    │   │       ├── ShowroomStage.tsx       # Studio lightformers, spotlight & reflector floor
    │   │       ├── CameraRig.tsx           # Damped camera angle controller
    │   │       ├── Vehicle3DViewer.tsx     # 3D model inspection viewer
    │   │       └── VehicleSpinViewer.tsx   # 360° drag-spin turntable from photos
    │   ├── context/
    │   │   ├── CompareContext.tsx   # Comparison dock state
    │   │   └── LanguageContext.tsx  # English / Amharic state
    │   ├── lib/
    │   │   ├── share.ts             # Telegram deep-link & flyer sharing
    │   │   └── translations.ts      # Bilingual translation dictionary
    │   └── types.ts                 # TypeScript interfaces (Vehicle, Dealership, etc.)
```

---

## 4. Development & Testing Commands

### Backend Commands
```bash
cd backend
python -m venv venv
.\venv\Scripts\activate
pip install -r requirements.txt
python test_afromessage_sms.py
uvicorn main:app --host 127.0.0.1 --port 8000 --reload
```

### Frontend Commands
```bash
cd frontend
npm install
npm run dev
npm run build
```

---

## 5. Remote Server & Deployment (godaddy)

- **SSH Target Alias**: `godaddy`
- **User**: `newproj`
- **Privileges**: Full passwordless sudo (`sudo <command>`)
- **OS & Environment**: AlmaLinux 10 with cPanel
- **Remote Execution**:
  ```bash
  ssh godaddy '<command>'
  ```
- **File Upload**:
  ```bash
  scp <local-file> godaddy:~/.
  ```
- **STRICT SAFETY BOUNDARY**:
  > [!CAUTION]
  > **DO NOT TOUCH `/home/damaplus1` OR ANYTHING RELATED TO DAMAPLUS.**
  > Never read, write, modify, or delete `/home/damaplus1`. Keep all operations strictly inside `/home/newproj`.
  > Persisted globally in `global.md` and `GEMINI.md`.

- **Live Production Domain**:
  - **URL**: `https://car.wagadelivery.com/`
  - **SSL**: Let's Encrypt automated TLS via Certbot (`certbot-renew.timer` active)
  - **Showroom Scoped URL**: `https://car.wagadelivery.com/?dealer=elite-motors`
  - **Admin Control Desk**: `https://car.wagadelivery.com/admin`
  - **API Root**: `https://car.wagadelivery.com/api/public/dealerships`
