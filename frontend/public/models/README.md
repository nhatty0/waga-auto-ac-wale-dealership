# AutoShowroom Ethiopia — 3D Asset Guidelines & GLB Specification

This directory holds the 3D assets used by the **Cinematic 3D Hero** and the **Vehicle Detail 3D Inspector**.

---

## 1. File Placement & Naming

| Asset | Path | Description |
| :--- | :--- | :--- |
| **Hero Showcase GLB** | `/public/models/showroom_car.glb` | Primary 3D vehicle rendered in the public showroom hero canvas. |
| **Per-Vehicle Models** | `/public/models/<vehicle-id>.glb` or Remote S3/R2 URL | Loaded when a vehicle listing includes the `model_url` field. |

If no `.glb` file is placed at `/public/models/showroom_car.glb`, the showroom automatically renders the built-in procedural luxury sports coupe model with full PBR shading, clearcoat, and interactive color swatches.

---

## 2. PBR Material Slot Conventions

To enable real-time exterior paint color swatching, ensure your 3D model uses standard material naming:

### Exterior Paint Material (Live Lerping)
- **Material Name**: Name your main body paint material one of the following:
  - `CarBody` *(Recommended)*
  - `Paint`
  - `Body`
  - `Exterior`
- **PBR Attributes**:
  - `Metalness`: `0.80 - 0.90`
  - `Roughness`: `0.15 - 0.25`
  - `Clearcoat`: `1.0`
  - `ClearcoatRoughness`: `0.10`

### Other Standard Material Names
- **`Glass` / `Windows`**: High transmission (`0.90`), IOR `1.52`, roughness `0.05`.
- **`Chrome` / `Alloy`**: Metalness `0.95`, roughness `0.12`.
- **`Tire` / `Rubber`**: Metalness `0.05`, roughness `0.85`.
- **`Headlight`**: Emissive white/blue with bloom glow.
- **`Taillight`**: Emissive ruby red (`#ef4444`).

---

## 3. Compression & Performance Budgets

To ensure high frame rates (60fps) on mid-range Android devices and fast loading across Ethiopian mobile networks (Ethio Telecom 3G/4G, Safaricom Ethiopia):

1. **Target Budget**:
   - Total compressed file size: **< 3 MB**.
   - Polygon count: **< 75,000 triangles**.
   - Draw calls: **< 25 draw calls** (combine meshes sharing materials).
2. **Draco Compression**:
   ```bash
   npx gltf-pipeline -i input_car.glb -o showroom_car.glb -d --draco.compressionLevel 7
   ```
3. **Meshoptimizer / KTX2 Alternative**:
   ```bash
   gltfpack -i input_car.glb -o showroom_car.glb -cc -tc
   ```
4. **Textures**:
   - Max texture resolution: 1024x1024 (or 2048x2048 for hero body only).
   - Use WebP or Basis Universal / KTX2 textures.

---

## 4. Fallback Architecture

If a client device has:
- Data Saver enabled (`navigator.connection.saveData = true`)
- 2G or 3G slow connection
- Low device memory (RAM <= 2GB)
- No WebGL support

The application gracefully skips WebGL initialization and displays the optimized CSS-accelerated poster (`Hero3DPoster.tsx`), providing an instant Largest Contentful Paint (LCP) and zero battery drain.
