# Accordion Music — PWA Player (zero-build)

Sleek, minimal, installable music player. Open a local music folder and pick songs
from a React-Bits-style **AccordionGallery**. Plain HTML/CSS/JS — **no `npm install`,
no build step**. Drop these files into a GitHub repo and host with GitHub Pages.

## Host on GitHub Pages (2 options)

**A — Automatic (recommended, uses the included workflow):**
1. Create a repo and upload everything in this folder (drag & drop on github.com works).
2. Go to **Settings → Pages → Build and deployment → Source: GitHub Actions**.
3. Push to `main` (or **Actions → Deploy to GitHub Pages → Run workflow**). Done —
   your URL is `https://<you>.github.io/<repo>/`.

**B — One click, no Actions:**
1. Upload the files to a repo.
2. **Settings → Pages → Source: Deploy from a branch → Branch: `main` / `/ (root)` → Save.**

No `package.json`, no `node_modules`, no build. The service worker (`sw.js`),
manifest (`manifest.webmanifest`) and icons use **relative URLs**, so both user
sites (`you.github.io`) and project sites (`you.github.io/repo/`) work.

Local preview without anything installed:
```bash
python3 -m http.server 8000
# open http://localhost:8000
```

## Features

- **Folder → gallery**: File System Access API (`showDirectoryPicker`, recursive,
  subfolders) with `<input webkitdirectory>` fallback + drag & drop.
- **AccordionGallery song picker** (`js/gallery.js` + `css/accordion-gallery.css`):
  GSAP expand/collapse, parallax, tilt, grayscale, hover/click trigger, keyboard nav,
  labels with artist subtitle, playing EQ indicator.
- **Metadata**: filename parsing (`Artist - Title`), embedded title/artist/art via
  `jsmediatags` CDN (graceful offline fallback), duration probing, generative
  gradient covers otherwise.
- **Player**: play/pause, next/prev, seek, volume/mute, shuffle, repeat off/all/one,
  auto-advance, visualizer, Media Session (lock-screen) controls,
  keyboard shortcuts (Space, Shift+←/→).
- **PWA**: hand-written `sw.js` (app-shell precache + CDN/art runtime cache),
  install prompt, standalone display, theme `#060010`, 192/512 + maskable icons.
- **Privacy**: files never leave the device (Object URLs). Directory handle
  optionally persisted in IndexedDB for one-tap reconnect.

## Files

- `index.html` — app shell (relative URLs only)
- `css/accordion-gallery.css` — gallery styles (React Bits port)
- `css/app.css` — app + player styles
- `js/gallery.js` — vanilla AccordionGallery (`window.createAccordionGallery`)
- `js/library.js` — folder scan, covers, tags, IndexedDB (`window.MusicLib`)
- `js/app.js` — state, player, PWA wiring (lazy-loads GSAP/jsmediatags from CDN)
- `manifest.webmanifest`, `sw.js`, `favicon.svg`, `icons/`
- `.github/workflows/pages.yml` — zero-build Pages deploy
- `.nojekyll` — serve as-is on Pages
