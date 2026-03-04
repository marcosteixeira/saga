# Steampunk Design System — "The Foundry"

> Industrial/High Steampunk aesthetic for the Saga RPG platform.
> Inspired by the macro scale of the Industrial Revolution — towering smokestacks, airship-crowded skylines, cast iron and burnished copper, soot and grit.

## Reference

Visual direction drawn from a golden-hour industrial steampunk cityscape: dense smokestacked skyline, clocktowers, airships, foreground machinery, warm amber backlighting cutting through smog. The key insight is **warm steampunk** — amber-lit, not cold/gray.

---

## 1. Color System: "Golden Hour Foundry"

### Core Palette

| Token        | Hex       | Description                                      |
| ------------ | --------- | ------------------------------------------------ |
| `--soot`     | `#0d0c0a` | Deep shadow, charcoal black with warm undertone   |
| `--iron`     | `#1a1814` | Dark machinery surfaces, near-black with warmth   |
| `--smog`     | `#2a2520` | Smoky mid-dark, hazy background buildings         |
| `--gunmetal` | `#3d3630` | Weathered metal panels, tarnished surfaces        |
| `--ash`      | `#9a8a7a` | Oxidized metal, muted mid-tones (≥7:1 on soot)    |
| `--brass`    | `#c4943d` | Primary accent — polished brass fittings          |
| `--copper`   | `#b87333` | Secondary accent — burnished copper machinery     |
| `--amber`    | `#e8a835` | Furnace glow, lantern light, golden hour sun      |
| `--furnace`  | `#d4622a` | Hot metal, active/hover states, ember orange      |
| `--steam`    | `#d4cabb` | Fog, text on dark, aged parchment white           |
| `--patina`   | `#5a7a6d` | Verdigris on old copper, subtle cool accent       |
| `--sky-slate`| `#4a5568` | Overcast sky, cool contrast to warm palette       |

### Semantic Mapping

| Purpose         | Token                              |
| --------------- | ---------------------------------- |
| Background      | `--soot` → `--iron` gradient       |
| Surface (cards) | `--smog` at 85% opacity            |
| Surface border  | `--gunmetal`                       |
| Primary text    | `--steam`                          |
| Muted text      | `--ash`                            |
| Primary action  | `--brass`                          |
| Hover / active  | `--furnace`                        |
| Destructive     | `#e05555` (readable warm red)      |
| Success         | `--patina`                         |
| Links           | `--amber`                          |

### Gradient Signatures

- **Furnace glow**: `radial-gradient` from bottom-center, `--furnace` at 6-8% opacity — simulates warm light source below
- **Smog layer**: `linear-gradient` from transparent → `--soot` at 60% — atmospheric haze
- **Brass sheen**: `linear-gradient(135deg, --copper, --brass, --copper)` — metallic highlight on interactive elements

---

## 2. Typography

### Font Stack

| Role              | Font                 | Weight    | Reason                                                        |
| ----------------- | -------------------- | --------- | ------------------------------------------------------------- |
| **Display/Titles**| Pragati Narrow       | 700       | Tall, compressed, industrial — stamped factory signage         |
| **Headings**      | Rokkitt              | 500, 700  | Slab serif with mechanical precision — "GEARWORKS VANTAGE"    |
| **Body**          | Barlow Condensed     | 400, 500, 600 | Tight, utilitarian, highly legible — factory manual        |
| **Mono/Data**     | Share Tech Mono      | 400       | Pressure gauge readouts, stats, game data                     |

All fonts available on Google Fonts.

### Scale & Treatment

| Level          | Size                          | Style                                                |
| -------------- | ----------------------------- | ---------------------------------------------------- |
| Display        | `clamp(3rem, 8vw, 6rem)`     | Uppercase, `letter-spacing: 0.15em`, `--brass`       |
| H1             | `2.5rem`                      | Uppercase, `letter-spacing: 0.08em`                  |
| H2             | `1.75rem`                     | Uppercase, `letter-spacing: 0.05em`                  |
| Body           | `1rem`                        | `line-height: 1.6`                                   |
| Caption/Small  | `0.875rem` (text-sm)          | Uppercase, `letter-spacing: 0.12em`, `--ash`         |

**All headings uppercase** — industrial stamped feel.

### Signature Details

- Headings: subtle `text-shadow: 0 0 40px rgba(196, 148, 61, 0.3)` (warm brass glow)
- Display text: faint metallic gradient on hover (brass → amber → brass)

---

## 3. Surfaces & Components

### Panel System

#### Iron Plate — Primary container

- Background: `--smog` at 85% opacity
- Border: `1px solid --gunmetal`
- Box-shadow: multi-layer (inner highlight top-left, deep shadow bottom-right)
- Corners: small chamfered cuts via `clip-path` (industrial, not rounded)
- Rivet dots: 4 pseudo-element circles at corners with `--gunmetal` radial gradient highlight

#### Copper Gauge Panel — Accent/interactive containers

- Border: `2px solid --copper`
- Inner glow: `box-shadow: inset 0 0 20px rgba(184, 115, 51, 0.1)`
- Use for: form inputs, stat displays, interactive elements

#### Leather Strap — Navigation/tabs

- Background: linear gradient simulating leather texture (dark brown bands)
- Border-bottom: brass-colored line
- Active state: brass rivet indicator

### Buttons

| Variant         | Style                                                                                      |
| --------------- | ------------------------------------------------------------------------------------------ |
| **Primary**     | `--brass` bg, `--soot` text, chamfered corners, embossed inner shadow. Hover → `--furnace` |
| **Secondary**   | `--gunmetal` bg, `--steam` text, `--copper` border. Hover → border brightens to `--brass`  |
| **Ghost**       | Transparent, `--brass` text + border. Hover → fills `--smog`                               |
| **Destructive** | Rusted red bg, chamfered corners. Hover → brighter + ember particle burst                  |

### Inputs

- Background: `--iron`
- Border: `1px solid --gunmetal`, focus → `--brass` with amber glow shadow
- Placeholder: `--ash`, small-caps
- Labels: `Share Tech Mono`, uppercase, `--copper` — gauge label style

### Dividers

- **Brass pipe**: horizontal rule with metallic gradient, circular "joints" at endpoints
- **Rivet line**: dotted border with circular dots evenly spaced — row of rivets

---

## 4. Atmospheric Effects

### Layered Background System

5 composited layers (bottom → top):

1. **Base**: solid `--soot`
2. **Furnace underglow**: radial gradient from bottom-center, `--furnace` at 6% opacity
3. **Smog drift**: CSS animated semi-transparent gradient bands drifting horizontally (30-40s cycle)
4. **Soot particles**: tiny dark specks + embers drifting upward, varying speed/opacity (canvas or CSS)
5. **Vignette**: radial gradient darkening edges — focuses attention center

### Smoke / Steam

- **Steam vents**: on page load/transitions, white-to-transparent particles burst upward from bottom edge
- **Ambient smoke**: 2-3 large, slow, translucent blobs drifting across viewport (`filter: blur(60px)`, CSS keyframes)
- **Smog parallax**: on scroll, background smoke layers move at different speeds

### Ember Particles

- Small orange dots (`--furnace` / `--amber`)
- Size: 1-4px
- Opacity: 0.3-0.8
- Rise speed: 8-20s
- Drift: gentle sine wave
- Glow: `box-shadow` bloom
- Density: ~20-30 on landing page, fewer on gameplay screens

### Gear Mechanism

- Large decorative gear cluster (SVG) in background corners
- Slow rotation (60s+), very low opacity (0.05-0.1) — atmospheric, not distracting
- Visible through smog layers for depth

### Transition Effects

- Page transitions: steam burst + fade
- Card hover: brass edge glow + slight lift
- Button press: mechanical "clunk" (tiny downward shift + shadow reduction)
- Loading: piston animation (horizontal reciprocating bar)

---

## 5. Layout Philosophy: The Foundry Grid

### Principles

- **Asymmetric panels**: Iron plates of different sizes, some overlapping slightly
- **Vertical brass pipes**: Visual column separators (not just whitespace)
- **Heavy I-beam rules**: Section dividers with weight and presence
- **Depth through overlap**: Panels overlap edges by 8-16px with varying z-index — layered machinery feel
- **Viewport metaphor**: Content appears within porthole-like framed areas on dense pages

### Responsive Strategy

| Breakpoint  | Behavior                                                                |
| ----------- | ----------------------------------------------------------------------- |
| **Desktop** | Full effects, multi-column asymmetric layouts, all particles            |
| **Tablet**  | Single-column, atmospheric effects preserved, fewer particles           |
| **Mobile**  | Stacked layout, ~10 particles, keep furnace glow + vignette, no parallax|

### Accessibility

- All animations respect `prefers-reduced-motion` — static fallbacks for every effect
- Contrast: `--steam` on `--smog` ≈ 7:1, `--brass` on `--soot` ≈ 6.5:1, `--ash` on `--soot` ≈ 7:1
- Focus indicators: bright `--amber` outline (high visibility against dark surfaces)
