# App icons

Home-screen icon is the owner flag mark: a white flag on a green mound with lime rings, centered on near-black `#010101`. No wordmark. The file is 1024² opaque RGB (no alpha, no rounded corners baked in). The mark sits inside the iOS safe area (about 80% of the canvas). Splash / launch still is the first frame of Doc’s 3s open clip (784×1168, `#000101`) — same pixels as `assets/splash/splash-first-frame-v2.png`. Expo and JS show it with `contain` + black letterbox (never `cover`). The open clip plays once on cold start, muted, with `mixWithOthers`.

| File | Wired from |
| --- | --- |
| `icon.png` | `app.json` `expo.icon` (iOS / home screen), 1024² flag mark on `#010101` |
| `splash-icon.png` | `expo-splash-screen` plugin, 784×1168 first frame of Doc’s open clip |
| `android-icon-foreground.png` | Android adaptive foreground (Build 36, 66% safe-zone inset) |
| `android-icon-background.png` | Android adaptive background (`#05190D` field) |
| `android-icon-monochrome.png` | Themed icon luminance of the Build 36 art |
| `favicon.png` | Web favicon, 48² from Build 36 |
| `ios/*.png` | Pixel sizes Expo / iOS App Icon expects, Lanczos from `icon.png` |

Android adaptive art and the favicon are unchanged. Bundle ID `com.shottrax.app` and slug `shottrax` stay unchanged. User-facing name is **ShotTraxx™**.
