# PostPrep · Blue Archive theme — design tokens

One top-level skin `html[data-ui="ba"]` (fourth in the cycle glass → classic → rococo → ba) with a
second-level student switch `html[data-ba="koyuki|hoshino|momoi|kei|shiroko"]`. The shared shell copies the
Schale tablet UI of the game; each student changes palette, art, decor, motion and the RVC console.

## Shell (shared)
| token | day | night | use |
|---|---|---|---|
| `--ba-blue` | `#128cff` | `#3aa8ff` | Schale accent: primary buttons, active nav, focus ring |
| `--ba-sky` | `#5fc6ff` | `#6fd2ff` | button top gradient, tap burst, scrollbar |
| `--ba-yellow` / `-2` | `#ffe04b` / `#ffc928` | same | the big confirm button (`#rvc-convert`), MISSION CLEAR |
| `--ba-navy` | `#1d2e46` | `#e6f0ff` | headings |
| `--ba-text` / `-2` / `-3` | `#24344d` / `#4a5a73` / `#7486a0` | `#e8f0fb` / `#b9c7dc` / `#8c9db6` | body copy |
| `--ba-panel` | `#ffffff` | student `night.panel` | panel plates |
| `--ba-well` | `#e9f0f7` | `#0d182c` | inner wells, inputs' surroundings |
| `--ba-cut` | `14px` | | slanted corner size of plates |

All `--v3-*` tokens are re-pointed to these, so anything v3 paints follows the theme.

**Shapes.** Plates: white, 1px navy-alpha rim, slanted cuts top-left + bottom-right, a blue/student-colour
tab bar on the top edge. The plate is drawn on `::before` with `clip-path`, so children (menus, popovers)
are never clipped. Buttons: parallelograms (`skewX(-12deg)` on `::before`, upright label), 3px solid
under-shadow, press = sink 2px + white flash (`::after`). Chips: small skewed tags. Toast = MomoTalk bubble
with the student avatar. Anywhere you tap: a light-blue ring burst (`.ba-tap`).

**Type.** Headings: Barlow Condensed Bold/ExtraBold Italic + Noto Sans SC 800 (synthesised oblique), the
closest OFL match to the game's condensed italic UI face. Body: Barlow Medium + system CJK sans.
Fonts are subset woff2 in `fonts/` with `LICENSE-OFL.txt`.

## Students (from `img/<name>/palette.json`, compiled into CSS variables by build.py)
| student | primary | primary2 | accent | background motif (one, line art) | motion | RVC console |
|---|---|---|---|---|---|---|
| koyuki 小雪 (Millennium · Seminar) | pink | purple | coin gold | vault combination dial: bezel + 100-tick number ring | ring turns +32° / −14° and back over 30 s | vault palette (lilac frame, plum screen); readout `LOCKED · 0000` |
| hoshino 星野 (Abydos · Foreclosure Task Force) | pink | ocean blue | sand | sonar: 4 range rings, bearing cross + ticks | one soft sweep per 20 s | deep-sea palette; readout `DEPTH 0420 m` |
| momoi 小桃 (Millennium · Game Dev) | hot pink | coin yellow | 1UP green | ordered-dither (Bayer 4×4) pixel field + one 1UP heart | heart breathes in opacity (6 s) | handheld palette (pink shell, green LCD); readout `PRESS START` |
| kei 柯伊 (Millennium · Game Dev) | blue | cyan | violet | circuit traces converging on a square core | nodes light in sequence (8 s) | holo palette, 1px corner brackets; readout `AL-1S · LINK` |
| shiroko 白子 / 砂狼白子 (Abydos · Foreclosure Task Force) | cyan | steel grey-blue | Abydos sand | route map: contour lines, Abydos → Schale route, checkpoints | the Schale marker breathes (5 s) | bike-computer palette; readout `41.6 km · ▲ 128 m` |

**Background system (polish 2026-11).** Flat paper gradient (no colour blobs) · one 1px grid (40px) fading out of the
top-left · one Schale cut: a skewed pale plane on the right with two 1px rules (hidden < 761px) · the student's one
motif in a fixed bottom-right box `min(66vmin, 640px)`, partly off-canvas. Strokes: structure 1px at 24% of primary2,
accent 1.5px at 50% of primary; tiny fills at 55%; labels Barlow 600 italic 12–13px. No props outside the RVC console
frame, no blinking, no glow. Hero backdrop: a clean skewed plate with a 1px leading rule, fading out at the bottom.

`palette.json` schema (all colours `#rrggbb`):
```json
{ "primary": "#f07fc6", "primary2": "#a67cf0", "accent": "#ffcf4a", "ink": "#3a2556", "tint": "#fdf3fb",
  "night": { "bg": "#1a1230", "panel": "#271c42", "ink": "#f7eaff", "primary": "#ff9ad8", "primary2": "#c3a2ff" } }
```
Missing or invalid keys fall back to the placeholder palette.

Art per student (exact names): `portrait.webp` (half-body, transparent, ~900×1200, head near the top),
`chibi.webp` (transparent, ~420×460, feet at the bottom edge), `avatar.webp` (square, face centred,
≥256px), `halo.svg` (transparent, square viewBox). CSS reads them only through
`--ba-portrait / --ba-chibi / --ba-avatar / --ba-halo` (+ `--ba-av-<name>` for the switcher).

## Day / night
Night when the OS is dark or local time is 19:00–06:00. Force with `?ba-time=night|day` or
`localStorage["postprep-ba-time"]`. Night swaps panel/background to the student's `night` palette.

## Invariants
- Every rule is under `html[data-ui="ba"]` (`.v3s.v3s` added to beat v3's `!important`); other skins are pixel-identical.
- Never changes ids, `data-*` hooks, names, DOM order or listeners of the app. Decor is `aria-hidden` + `pointer-events:none`.
  Interactive additions: the avatar radiogroup in the top bar and the corner chibi button.
- Motion is transform/opacity; `prefers-reduced-motion: reduce` stops all animation and hides tap bursts and bubbles; animations pause in hidden tabs.
- No inline scripts, no CDN, no eval; CSP unchanged.
