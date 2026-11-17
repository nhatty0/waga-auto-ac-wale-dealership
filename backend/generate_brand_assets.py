import subprocess
from pathlib import Path

# Paths
PUBLIC_DIR = Path("frontend/public")
ICONS_DIR = PUBLIC_DIR / "icons"
ICONS_DIR.mkdir(parents=True, exist_ok=True)

# 1. HORIZONTAL LOGO: ac-wale-logo.svg
AC_WALE_LOGO_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 120" width="100%" height="100%">
  <defs>
    <!-- Amber Gold Gradient -->
    <linearGradient id="amberGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="40%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <!-- Vibrant Red Car Contour Gradient -->
    <linearGradient id="vibrantRed" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#EF4444" stop-opacity="0.1"/>
      <stop offset="25%" stop-color="#EF4444"/>
      <stop offset="70%" stop-color="#DC2626"/>
      <stop offset="100%" stop-color="#B91C1C"/>
    </linearGradient>

    <!-- Titanium White / Silver Gradient -->
    <linearGradient id="titaniumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="60%" stop-color="#F1F5F9"/>
      <stop offset="100%" stop-color="#CBD5E1"/>
    </linearGradient>

    <!-- Soft Glow Filter -->
    <filter id="redGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="3" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- EMBLEM GROUP (x: 10 to 125, y: 10 to 110) -->
  <g id="emblem" transform="translate(15, 8)">
    <!-- Red Car Silhouette Contour Line (Aerodynamic Roofline) -->
    <path d="M 5 78 C 15 50, 42 22, 64 22 C 86 22, 105 48, 118 76 C 122 80, 128 80, 132 75 C 130 70, 118 40, 95 18 C 76 2, 48 3, 24 22 C 8 36, 0 58, 0 78 Z"
          fill="url(#vibrantRed)" filter="url(#redGlow)"/>

    <!-- Stylized "A" Monogram Left Blade -->
    <path d="M 64 25 L 53 25 L 18 95 L 34 95 L 45 73 L 64 73 Z"
          fill="url(#titaniumGrad)"/>

    <!-- Stylized "A" Monogram Right Blade -->
    <path d="M 64 25 L 75 25 L 110 95 L 94 95 L 83 73 L 64 73 Z"
          fill="url(#titaniumGrad)"/>

    <!-- Embraced Amber-Gold "C" Monogram Arc -->
    <!-- Curves gracefully through the center of "A" -->
    <path d="M 76 43 C 86 48, 92 58, 90 70 C 88 80, 78 89, 64 89 C 50 89, 40 80, 39 68 C 38 58, 44 48, 54 43 L 59 52 C 53 55, 49 61, 50 67 C 51 74, 57 79, 64 79 C 72 79, 78 74, 79 67 C 80 61, 76 56, 71 52 Z"
          fill="url(#amberGold)"/>

    <!-- "WALE" Horizontal Bar of "A" -->
    <rect x="36" y="65" width="56" height="15" rx="3" fill="#09090b" stroke="url(#amberGold)" stroke-width="1.2"/>
    <text x="64" y="77" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="10.5" letter-spacing="2.5" fill="#FFFFFF" text-anchor="middle">WALE</text>

    <!-- Dynamic Red Accent Dash (Front Splitter) -->
    <path d="M 12 96 L 116 96 L 110 99 L 18 99 Z" fill="#EF4444"/>
  </g>

  <!-- TYPOGRAPHY TEXT COMPANION -->
  <!-- Line 1: AC WALE MARKET (Bold Amber-Gold #F59E0B) -->
  <text x="160" y="56" fill="url(#amberGold)" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="36" letter-spacing="2">AC WALE MARKET</text>

  <!-- Line 2: ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ (Amharic Subtitle in Clean Light Gray / White) -->
  <text x="162" y="90" fill="#E2E8F0" font-family="'Noto Sans Ethiopic', 'Nyala', 'Abyssinica SIL', system-ui, sans-serif" font-weight="700" font-size="19" letter-spacing="0.8">ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ</text>

  <!-- Sub-tag divider accent -->
  <rect x="162" y="101" width="380" height="2" rx="1" fill="url(#amberGold)" opacity="0.6"/>
</svg>
"""

# 2. SQUARE BADGE & ICON: logo.svg (512x512)
LOGO_512_SVG = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="100%" height="100%">
  <defs>
    <!-- Background Obsidian Gradient -->
    <radialGradient id="bgDark" cx="50%" cy="40%" r="65%">
      <stop offset="0%" stop-color="#18181b"/>
      <stop offset="60%" stop-color="#0c0c0e"/>
      <stop offset="100%" stop-color="#050507"/>
    </radialGradient>

    <!-- Amber Gold Gradient -->
    <linearGradient id="amberGold" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FDE68A"/>
      <stop offset="40%" stop-color="#F59E0B"/>
      <stop offset="100%" stop-color="#D97706"/>
    </linearGradient>

    <!-- Vibrant Red Car Contour Gradient -->
    <linearGradient id="vibrantRed" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#EF4444" stop-opacity="0.2"/>
      <stop offset="25%" stop-color="#EF4444"/>
      <stop offset="70%" stop-color="#DC2626"/>
      <stop offset="100%" stop-color="#B91C1C"/>
    </linearGradient>

    <!-- Titanium White Gradient -->
    <linearGradient id="titaniumGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#FFFFFF"/>
      <stop offset="60%" stop-color="#F1F5F9"/>
      <stop offset="100%" stop-color="#CBD5E1"/>
    </linearGradient>

    <!-- Outer Border Gradient -->
    <linearGradient id="borderGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.6"/>
      <stop offset="50%" stop-color="#27272a"/>
      <stop offset="100%" stop-color="#EF4444" stop-opacity="0.5"/>
    </linearGradient>

    <!-- Ambient Amber Underglow -->
    <radialGradient id="ambientAmber" cx="50%" cy="45%" r="45%">
      <stop offset="0%" stop-color="#F59E0B" stop-opacity="0.25"/>
      <stop offset="60%" stop-color="#F59E0B" stop-opacity="0.05"/>
      <stop offset="100%" stop-color="#000000" stop-opacity="0"/>
    </radialGradient>

    <!-- Glow Filter -->
    <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="6" result="blur"/>
      <feComposite in="SourceGraphic" in2="blur" operator="over"/>
    </filter>
  </defs>

  <!-- Base Plate with Rounded Corners -->
  <rect x="8" y="8" width="496" height="496" rx="108" fill="url(#bgDark)"/>
  <rect x="8" y="8" width="496" height="496" rx="108" fill="none" stroke="url(#borderGrad)" stroke-width="3"/>
  <rect x="14" y="14" width="484" height="484" rx="102" fill="none" stroke="#FFFFFF" stroke-opacity="0.05" stroke-width="1.5"/>

  <!-- Ambient Underglow -->
  <ellipse cx="256" cy="220" rx="190" ry="140" fill="url(#ambientAmber)"/>

  <!-- EMBLEM GROUP (Centered at x: 256, y: 190) -->
  <g id="center-emblem" transform="translate(256, 195) scale(2.1) translate(-64, -62)">
    <!-- Red Car Silhouette Contour Line (Aerodynamic Roofline) -->
    <path d="M 5 78 C 15 50, 42 22, 64 22 C 86 22, 105 48, 118 76 C 122 80, 128 80, 132 75 C 130 70, 118 40, 95 18 C 76 2, 48 3, 24 22 C 8 36, 0 58, 0 78 Z"
          fill="url(#vibrantRed)" filter="url(#softGlow)"/>

    <!-- Stylized "A" Monogram Left Blade -->
    <path d="M 64 25 L 53 25 L 18 95 L 34 95 L 45 73 L 64 73 Z"
          fill="url(#titaniumGrad)"/>

    <!-- Stylized "A" Monogram Right Blade -->
    <path d="M 64 25 L 75 25 L 110 95 L 94 95 L 83 73 L 64 73 Z"
          fill="url(#titaniumGrad)"/>

    <!-- Embraced Amber-Gold "C" Monogram Arc -->
    <path d="M 76 43 C 86 48, 92 58, 90 70 C 88 80, 78 89, 64 89 C 50 89, 40 80, 39 68 C 38 58, 44 48, 54 43 L 59 52 C 53 55, 49 61, 50 67 C 51 74, 57 79, 64 79 C 72 79, 78 74, 79 67 C 80 61, 76 56, 71 52 Z"
          fill="url(#amberGold)"/>

    <!-- "WALE" Horizontal Bar of "A" -->
    <rect x="36" y="65" width="56" height="15" rx="3" fill="#09090b" stroke="url(#amberGold)" stroke-width="1.2"/>
    <text x="64" y="77" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif" font-weight="900" font-size="10.5" letter-spacing="2.5" fill="#FFFFFF" text-anchor="middle">WALE</text>

    <!-- Dynamic Red Accent Dash (Front Splitter) -->
    <path d="M 12 96 L 116 96 L 110 99 L 18 99 Z" fill="#EF4444"/>
  </g>

  <!-- TYPOGRAPHY TEXT COMPANION (Centered Lower Half) -->
  <!-- Line 1: AC WALE MARKET (Bold Amber-Gold #F59E0B) -->
  <text x="256" y="388" fill="url(#amberGold)" font-family="system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif" font-weight="900" font-size="34" letter-spacing="3" text-anchor="middle">AC WALE MARKET</text>

  <!-- Line 2: ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ (Amharic Subtitle in Clean Light Gray / White) -->
  <text x="256" y="428" fill="#E2E8F0" font-family="'Noto Sans Ethiopic', 'Nyala', 'Abyssinica SIL', system-ui, sans-serif" font-weight="700" font-size="20" letter-spacing="1" text-anchor="middle">ኤሲ ዋለ የመኪና መሸጫ እና ኪራይ</text>

  <!-- Bottom Accent Line -->
  <line x1="160" y1="448" x2="352" y2="448" stroke="url(#vibrantRed)" stroke-width="2.5" stroke-linecap="round"/>
</svg>
"""

# Write SVGs
(PUBLIC_DIR / "ac-wale-logo.svg").write_text(AC_WALE_LOGO_SVG, encoding="utf-8")
(PUBLIC_DIR / "logo.svg").write_text(LOGO_512_SVG, encoding="utf-8")
(PUBLIC_DIR / "favicon.svg").write_text(LOGO_512_SVG, encoding="utf-8")

print("✓ Wrote ac-wale-logo.svg, logo.svg, and favicon.svg successfully.")
