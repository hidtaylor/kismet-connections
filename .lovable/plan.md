## Brand refresh: Kismet logo, color system, favicon

### Heads-up on the uploaded logo

The uploaded `kidmet.png` is a heart with two face silhouettes and a script "Kismet" wordmark. Your own design standards (lines 61–69) explicitly say to **avoid** literal hearts, human faces, dating-app visual language, and script wordmarks. Two paths — pick one before I build:

- **A. Use the uploaded image as-is** for app icon, favicon, and auth screen. Fast, but contradicts your own brand doc.
- **B. Use the uploaded image only as a temporary favicon/app icon**, and design a new on-brand abstract mark in code (SVG): a small node-graph / constellation glyph using the new gradient (`#092A75 → #126BFF → #FF8A1F → #FF3B30`) for use inside the app (auth screen, headers). This matches the standards.
- **C. Don't use the uploaded image at all** — generate a fully on-brand SVG mark and use it everywhere including favicon.

I'll assume **B** unless you say otherwise.

### What I'll change

**1. Color tokens (`src/index.css`)**
Rebuild the HSL token palette around the Kismet system:
- Light mode: bg = Mist `#F5F7FA`, fg = Ink `#15171C`, primary = Kismet Blue `#126BFF`, accent = Kismet Orange `#FF8A1F`, destructive = Connection Red `#FF3B30`.
- Dark mode: bg = Ink `#15171C`, surface = Charcoal `#2B2F38`, primary = Kismet Blue `#126BFF` (slightly lifted for contrast), accent = Kismet Orange `#FF8A1F`.
- Add a `--gradient-kismet` token for the signature `#092A75 → #126BFF → #FF8A1F → #FF3B30` gradient and a `.bg-gradient-kismet` utility.
- Add `signal-pink` (`#F72585`) as an extra token for graph accents.
- Update `manifest.webmanifest` `theme_color` / `background_color` and `index.html` `<meta name="theme-color">` to match.

**2. Typography**
Add Inter via Google Fonts in `index.html` and set it as the primary sans in `tailwind.config.ts` and the `body` rule in `index.css` (system fonts remain as fallbacks).

**3. Logo asset**
- Copy `user-uploads://kidmet.png` → `public/kismet-logo.png` (used for favicon + PWA icon as a temporary app icon).
- Replace `public/favicon.ico` reference in `index.html` with `/kismet-logo.png` (delete `favicon.ico` so the browser doesn't fall back to it).
- Update `manifest.webmanifest` icons to point at `kismet-logo.png` (and keep `icon-512.png` only if we keep a maskable variant — otherwise replace).
- Create `src/components/KismetMark.tsx`: a small inline SVG (~28–40px) of an abstract 5-node constellation/graph glyph stroked with the Kismet gradient. This is the in-app brand mark.

**4. In-app usage**
- `src/pages/AuthPage.tsx`: replace the `<img src="/icon-512.png">` with `<KismetMark size={56} />` and refine the wordmark + tagline using "Remember the people who matter, when it matters."
- Optionally add the `KismetMark` next to the "Kismet" text where appropriate (settings header is fine to leave alone for now).

**5. Favicon / PWA**
- `public/favicon.ico`: delete.
- `index.html`: `<link rel="icon" type="image/png" href="/kismet-logo.png">` and update `apple-touch-icon` to `/kismet-logo.png`.
- `manifest.webmanifest`: update `theme_color` to `#126BFF` (light) / keep dark-mode meta as `#15171C`, point icons at `/kismet-logo.png`.

### Files touched
- `src/index.css` (color tokens, gradient utility, font)
- `tailwind.config.ts` (font family, optional gradient color stops)
- `index.html` (favicon, theme-color, Inter font link)
- `public/manifest.webmanifest` (theme/icons)
- `public/kismet-logo.png` (new — copied from upload)
- `public/favicon.ico` (deleted)
- `src/components/KismetMark.tsx` (new — abstract SVG mark)
- `src/pages/AuthPage.tsx` (use KismetMark)

### Out of scope (ask if you want them)
- Redesigning HomePage / ContactDetail visuals to use the new gradient.
- Building a real social-graph node visualization.
- Generating a properly-designed standalone logo PNG via the canvas-design skill (worth doing later — your standards deserve a real mark, not a repurposed AI render).

Reply "go" (with A/B/C choice if not B) and I'll implement.