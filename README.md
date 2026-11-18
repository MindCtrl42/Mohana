# Mohana - Motorcycle Haptic Navigation System (Web HUD)

**Mohana** (Short for *MotoHapticNav*) is a standalone, production-ready, zero-data motorcycle haptic navigation HUD. It is designed to run 100% offline once loaded, utilizing the phone's native satellite GPS and Web Bluetooth to trigger directional turn cues on your ESP32 handlebar device.

---

## 🚀 Key Features

1. **High-Contrast Industrial Minimalist Dark Mode:**
   - Engineered for direct outdoor sunlight readability.
   - Large touch targets and high-visibility color coding:
     - **Left Turn:** Amber (`#FFAA00`)
     - **Right Turn:** Cyan (`#00F0FF`)
     - **U-Turn:** Vibrant Orange (`#FF6600`)
     - **Safety / Lock:** Emerald Green (`#00E676`)

2. **Zero-Data & 100% Offline Architecture:**
   - Runs directly off pre-loaded waypoint coordinates using the phone's hardware GPS chip (`navigator.geolocation.watchPosition`).
   - Computes distance via the **Haversine formula** without needing mobile cellular data or cloud routing API calls while riding on the road.
   - Automatically transmits haptic cues when approaching within **40 meters** of an upcoming turn.

3. **Web Bluetooth Integration:**
   - **Target Device Name:** `MotoHapticNav`
   - **Service UUID:** `4fafc201-1fb5-459e-8fcc-c5c9c331914b`
   - **Characteristic UUID:** `beb5483e-36e1-4688-b7f5-ea07361b26aae` (with dynamic discovery fallback)
   - Transmits single-character commands: `'L'`, `'R'`, `'U'`, `'S'`.

4. **GitHub Pages Ready:**
   - Configured with `base: './'` in `vite.config.js` to ensure asset paths resolve properly on any free GitHub Pages repository URL (`https://<username>.github.io/<repo>/`) without affecting other domain repositories.

---

## 🛠️ Local Development & Testing

```bash
cd mohana-app

# 1. Install dependencies
npm install

# 2. Run local development server
npm run dev
```

Visit `http://localhost:5173` on your PC, or open your phone's browser (e.g. **Bluefy** on iOS or **Chrome** on Android) to `http://<your-pc-ip>:5173`.

---

## 🌐 Free GitHub Pages Deployment

### Option A: 1-Command Deploy via `gh-pages`

1. Initialize git in this directory and push to your GitHub repository:
   ```bash
   git init
   git add .
   git commit -m "Initial commit for Mohana navigation HUD"
   git branch -M main
   git remote add origin https://github.com/<YOUR-GITHUB-USERNAME>/<YOUR-REPO-NAME>.git
   git push -u origin main
   ```

2. Deploy directly to the `gh-pages` branch:
   ```bash
   npm run deploy
   ```

3. In your GitHub repository settings:
   - Navigate to **Settings > Pages**.
   - Under **Build and deployment > Source**, ensure **Deploy from a branch** is selected.
   - Set the Branch to **`gh-pages`** and folder to **`/(root)`**, then click **Save**.
   - Your web app will be live at: `https://<YOUR-GITHUB-USERNAME>.github.io/<YOUR-REPO-NAME>/`

---

## 📱 iOS & Android Browser Notes

- **iOS (iPhone):** Standard Safari disables Web Bluetooth by default. Open the published GitHub Pages URL inside the free **Bluefy – Web BLE Browser** app from the App Store.
- **Android:** Native Google Chrome supports Web Bluetooth and Satellite Geolocation out of the box.
