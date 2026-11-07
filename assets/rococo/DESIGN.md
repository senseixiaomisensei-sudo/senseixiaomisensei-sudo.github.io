# PostPrep · Rococo — design tokens (Apple-skeleton edition, 2026-11-07)

A luxury maison's website on Apple's skeleton. Spec: APPLE_SPEC.md (shared by every skin).

- Canvas: `--ap-bg #f5f5f7` / `--ap-bg-2 #fff` (night `#000` / `#1d1d1f`). Ink `#1d1d1f`, `#6e6e73`, `#86868b`.
- Accent (the only one): navy `#2a4a8a` (night fill `#3a5ea8`, night text `#9fb6ea`). Buttons, links, focus, selection.
- Gold `#b08d57`: a hairline only — the 40 px rule under section titles, the corner flourish on the hero device
  and the studio, the single inset line of the navy studio console. Never a fill, never text.
- Type: system stack (SF Pro / PingFang SC) everywhere; serif display (Playfair Display + Noto Serif SC 700)
  only for the page `h1` and section titles.
- Shape: 18 px cards, 12 px controls, 980 px pills, no strokes, no heavy shadows.
- Motion: one-shot reveals only (v3). No loops, no parallax, no stickers, seals, foil or script titles.
- Day/night: `data-rc-sky` (morning/afternoon/dusk/night) set once from the clock, `?rococo-time=` or
  `localStorage["rococo-time"]`; `data-rc-night` switches to the night palette. OS dark mode also selects night.
