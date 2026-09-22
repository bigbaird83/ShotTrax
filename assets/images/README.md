# App icons (Build 36 locked)

Night-green diorama, illuminated pin, three neon lime radar arcs into the light, white **Shot** over lime **Traxx**. Home-screen icon is this Build 36 art. Splash / launch still is the first frame of Doc’s 3s open clip (960², black field) — same pixels as `assets/splash/splash-first-frame-v2.png`. Expo and JS show it with `contain` + black letterbox (never `cover`).

| File | Wired from |
| --- | --- |
| `icon.png` | `app.json` `expo.icon` (iOS / home screen), 1024² Build 36 |
| `splash-icon.png` | `expo-splash-screen` plugin, 960² first frame of Doc’s open clip |
| `android-icon-foreground.png` | Android adaptive foreground (Build 36, 66% safe-zone inset) |
| `android-icon-background.png` | Android adaptive background (`#05190D` field) |
| `android-icon-monochrome.png` | Themed icon luminance of the Build 36 art |
| `favicon.png` | Web favicon, 48² from Build 36 |
| `ios/*.png` | Pixel sizes Expo / iOS App Icon expects, generated from Build 36 |

Small home-screen sizes thicken the neon arcs so they still read at ~60px. Bundle ID `com.shottrax.app` and slug `shottrax` stay unchanged. User-facing name is **ShotTraxx™**.
