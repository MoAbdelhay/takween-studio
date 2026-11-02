# TAKWEEN — Design & Engineering Services

A bilingual (English / Arabic) single-page site for a design & engineering studio,
where every section is a live WebGL point-cloud sculpture that assembles from
drifting light as you scroll.

**Live:** https://cosmic-mandazi-9b2649.netlify.app

## Services

| # | Service | Price |
|---|---------|-------|
| I | 2D Technical Drawings (AutoCAD — architectural / mechanical / electrical + lighting) | 999 SAR |
| II | 3D Building Design (Revit · Lumion · 3ds Max) | 1999 SAR |
| III | The Complete Set — 2D + 3D | 1799 SAR |
| IV | Data Analysis & Visualization | 299 SAR |
| V | App & Web Development | 1999 SAR |

## Features

- **Point-cloud engine** — the brand wordmark and all five services are ~46–60k
  points sampled parametrically and rendered live with Three.js (no model files).
- **Bilingual** — English (Fraunces + Space Grotesk) and Arabic (Cairo), with a
  language toggle that mirrors the layout to RTL and redraws the dust wordmark in
  the right script. Preference persists in `localStorage`.
- **Scroll-driven** — each service assembles as it scrolls to centre, with
  scroll-snap so services line up.
- **Teal-on-dark** gallery aesthetic, hold-to-focus interaction, reduced-motion
  and WebGL fallbacks.

## Tech

Plain HTML + CSS + JavaScript. Three.js is loaded from a CDN via an import map —
there is no build step.

## Run locally

```bash
python -m http.server 4173
# then open http://localhost:4173
```

## Files

- `index.html` — markup + inline i18n dictionary
- `style.css` — all styling (light/dark-neutral, LTR/RTL)
- `app.js` — the Three.js point-cloud engine
