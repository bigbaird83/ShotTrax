# App icons

Home-screen icon is the owner flag mark, redrawn large (option A, night green): a white flag on a green mound with three glowing lime arcs, on a night-green radial gradient (`#1E5A2E` → `#04110A`). No wordmark. The mark fills the canvas so it reads at home-screen size. The file is 1024² opaque RGB (no alpha, no rounded corners baked in). Every icon file here is rendered from `docs/design/icon/app-icon.html` by `node docs/design/icon/render-app-icon.cjs`; edit the HTML and re-run, never hand-edit the PNGs. Splash / launch still is the first frame of Doc’s 3s open clip (784×1168, `#000101`) — same pixels as `assets/splash/splash-first-frame-v2.png`. Expo and JS show it with `contain` + black letterbox (never `cover`). The open clip plays once on cold start. Its audio track is removed, and playback is muted at volume 0 with `mixWithOthers`.

| File | Wired from |
| --- | --- |
| `icon.png` | `app.json` `expo.icon` (iOS / home screen / Watch), 1024² flag mark, opaque RGB |
| `splash-icon.png` | `expo-splash-screen` plugin, 784×1168 first frame of Doc’s open clip |
| `android-icon-foreground.png` | Android adaptive foreground: the mark on transparent, inside the 66% safe zone |
| `android-icon-background.png` | Android adaptive background: the night-green gradient only |
| `android-icon-monochrome.png` | Android themed icon: white mark on transparent |
| `favicon.png` | Web favicon, 48² of the same mark |
| `ios/*.png` | Pixel sizes Expo / iOS App Icon expects, each rendered from the vector at its own size |

The wordmark art from Build 36 is retired from the icon; it lives on in the splash. Bundle ID `com.shottrax.app` and slug `shottrax` stay unchanged. User-facing name is **ShotTraxx™**.
