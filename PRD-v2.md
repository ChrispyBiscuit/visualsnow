# Visual Snow Relief Kit 2.0 — Product Requirements Document

Version 2.0 · 2026-10-26 · supersedes the noise and panel sections of `PRD.md`

**Status: built and released as 2.0.0.** Differences from this draft:

- 37 types, not 36. The three 1.x dot types this draft did not list (Colour dots, Transparent, Flashing sparkles) were kept in the Dots family.
- 28 built-in presets.
- The single-shader risk in section 4 came true on software rendering: the 37-type program compiles in about 1.6 s there and runs every branch per pixel. The renderer now compiles one small program per set of types in use and caches it. Gallery thumbnails are drawn a few per frame, only while visible.
- The preview's 1:1 toggle became a 1:1, 2×, 4× zoom control. 1:1 is the default.
- Inspector groups are Look, Timing, the type's own pattern group, Colour, Motion, Mask, Modulation and Schedule.
- Blend modes are named Show: All, Lights, Darks.

**2.1 panel revision.** The panel was rebuilt in the "Studio" look of the author's FancyReverb (Chromosphere) plug-in, replacing section 3.4's light and dark theme system: near-black matte faceplate with fine grain, raised plates, recessed display, one amber accent, Barlow typeface with tracked small capitals, large knurled dials with lit arcs. The three-pane layout became a layers plate plus a display over a dial plate, with an Advanced plate for colour, motion, mask, variation and schedule. Dark only.

## 1. Why 2.0

Two problems with 1.x.

1. **Noise range is narrow.** Ten types, and seven of them are "random cells on a grid". People with visual snow report textures 1.x cannot make: evenly spread dots with no clumps, dots that stay put and only flicker, worm-like floaters, phosphene blobs, patches of denser snow, snow that is worse at the edges of vision. People who want a film or CRT look are missing dust, scratches, tracking bands and halftone.
2. **The panel looks assembled, not designed.** Cards of unequal height stacked in two columns, sliders with no units or reset, a preview the size of a postage stamp, settings and calibration in the same scroll as the layer editor, no icons, no typed input, no theme. It works. It does not look like something a person would trust or show a clinician.

2.0 fixes both without changing the engine architecture: one shader, up to eight layers, one settings object.

## 2. Noise expansion

### 2.1 Design rule for new types

Every type must do one of three things: match a percept people with visual snow describe, match a familiar analog medium, or give a building block the other types need. No type is added because it is easy. Each type has a one-line "looks like" the user can read in the picker, and a thumbnail rendered live from the shader so the picker is a gallery, not a list.

### 2.2 Families

Types are grouped into six families. The picker shows families as tabs. Families share a parameter layout so the inspector does not jump around when the type changes.

#### Family A: Dots (the visual snow core)

| Type | Looks like | New parameters | Notes |
|---|---|---|---|
| Snow | Existing. Sparse dots, each on its own clock. | — | Unchanged. |
| Even snow | Same density but dots are evenly spread, no clumps or gaps. | spacing jitter | Blue-noise placement via a jittered grid with one dot per cell and a random offset. Many patients describe snow as a uniform fine texture, not clumpy. |
| Fixed shimmer | Dots stay in the same places and only flicker in brightness. | flicker depth, flicker rate | Position hash has no frame term. Brightness hash does. Reported by people whose snow is "a screen door that twinkles". |
| Pulsing dots | Dots fade in and out smoothly instead of switching on and off. | fade shape | Sine envelope on each dot's own clock. Softer than Snow. |
| Patchy snow | Snow whose density varies in slow drifting patches. | patch scale, patch contrast | Density is multiplied by low-frequency fbm. Models "denser in some areas, moving slowly". |
| Falling snow | Dots with a shared drift direction and slight wobble, like snowfall or a starfield. | direction, speed, wobble | Drift per dot with per-dot speed jitter so it reads as depth. |
| Bipolar burst | Short bursts of many dots then quiet. | burst rate, burst length | Density is gated by a slow square wave with jitter. Reported as "waves of static". |

#### Family B: Grain and static (analog media)

| Type | Looks like | New parameters |
|---|---|---|
| TV static | Existing. | — |
| Film grain | Existing, now with correct per-channel option. | colour grain on/off |
| Blue-noise grain | Grain with no low-frequency clumps. Reads smoother at the same strength. | — |
| Halftone | Print dot screen, dot size follows a slow brightness field. | angle, pitch |
| Ordered dither | Bayer matrix pattern that flickers between two phases. | matrix size |
| Dust and scratches | Occasional specks and vertical hairlines that last a few frames, like projected film. | speck rate, scratch rate, scratch length |
| VHS tracking | Horizontal bands of displaced static that roll, with a tearing line. | band height, roll speed |
| Interlace | Alternate lines flicker in opposite phase. | — |

#### Family C: Fields (clouds, swirls, cells)

| Type | Looks like | New parameters |
|---|---|---|
| Fog swirl | Existing fbm clouds. | — |
| Domain-warp swirl | Fbm pushed through itself. Marbled, flowing swirls like closed-eye visuals. | warp amount, warp speed |
| Cells | Worley noise. Soft bubbles or honeycomb that drift and merge. | cell size, edge width, mode (bubbles or edges) |
| Ripples | Concentric rings spreading from random points. | ring spacing, spawn rate, speed |
| Interference | Two drifting sine gratings. Moiré beats and bands. | angle, spacing, drift |
| Plasma | Classic sum-of-sines colour wash. | speed, hue spread |

#### Family D: Floaters and shapes

| Type | Looks like | New parameters |
|---|---|---|
| Floaters | Existing soft blobs that wander. | — |
| Squiggles | Translucent worm-like strands that drift and slowly bend, like vitreous floaters. | strand length, thickness, bend |
| Phosphene blobs | Large soft coloured blobs that bloom, drift and fade, as seen with eyes closed or pressed. | bloom time, hue drift |
| Flow particles | Thousands of tiny dots carried by a curl-noise flow field. | flow scale, flow speed, particle life |
| Bokeh | Big soft discs with a bright rim. | rim width |

#### Family E: Flicker and whole-screen

| Type | Looks like | New parameters | Safety |
|---|---|---|---|
| Pulse | Existing smooth sine. | — | Rate capped at 3 Hz unless unlocked. |
| Flicker | Random per-frame brightness jitter, like a bad fluorescent tube. | depth, rate | Depth capped at 10 percent above 3 Hz unless unlocked. |
| Breathing vignette | Edges darken and lighten slowly. | edge width, rate | — |
| Strobe | Hard flashes. For CRT and film looks only. | duty cycle | Capped at 3 Hz. Shows the photosensitivity warning on enable. Never in a built-in preset. |

#### Family F: Structure and lines

| Type | Looks like | New parameters |
|---|---|---|
| Scanlines | Existing. | — |
| Grid | Fine square or hex mesh that shimmers. | shape, pitch, line width |
| Rain streaks | Diagonal thin streaks falling at speed. | angle, length, rate |
| Checker flicker | Checkerboard whose two phases alternate. | pitch |

Total after 2.0: 36 types. Each is one branch in the shader. Types that need per-dot state (Flow particles, Squiggles, Ripples) use the same hash-and-clock method as Floaters: one element per region, position computed from the region id and time, never stored.

### 2.3 Layer features that apply to every type

| Feature | What it does | Why |
|---|---|---|
| **Mask** | Shape the layer: full, centre only, edges only, left or right half, top or bottom, with a feather control. | Many people report more snow in peripheral vision, or on one side. Also lets a user keep a reading area clear. |
| **Blend** | Over (default), Lighten (light parts only), Darken (dark parts only). | Lighten gives "light dots only on dark areas" without screen reading, because light dots on a white background vanish. Darken is the opposite. |
| **Modulation** | One slow LFO per layer that can drive opacity, density or rate between two values. | Snow is not constant. People report it rising and falling over minutes. |
| **Schedule** | Optional on and off times of day per layer. | Evening-only snow for people whose symptoms are worse at night, or for a dim-room demo. |
| **Rate lock** | Snap rate to the display refresh divisor. | Removes beat artefacts on 60 and 144 Hz screens. |

### 2.4 Presets

Built-in presets grow from twelve to about twenty-four and are grouped the same way as types: Clinical, Variants reported by patients, Analog media, Ambient and calm, Demo and extreme. Every preset has a live thumbnail. Each clinical preset names the study value it starts from.

### 2.5 Safety

- Any full-screen layer (Pulse, Flicker, Strobe) above 3 Hz needs a one-time unlock in Settings with the photosensitivity warning. The cap follows the WCAG 2.3.1 three-flashes rule.
- Dot types are not capped. Research snow is 18 Hz and dots cover 3 percent of the field, far below the flash area threshold.
- The first-run screen states the epilepsy warning once and links to the README section.

## 3. Panel redesign

### 3.1 Goals

- Looks like one designed product, not a page of cards.
- A user can see the full effect, large, while editing it.
- Every number can be typed, reset, and stepped with the keyboard.
- Settings, calibration and about are out of the way of daily use.
- Follows the OS light or dark theme. Reduced motion respected.

### 3.2 Layout

Three panes in one window, minimum 960 by 640.

```
┌──────────────────────────────────────────────────────────────────┐
│ ● Visual Snow Relief Kit      [Preset ▾]            Overlay [ON] ⚙ │
├──────────┬────────────────────────────────────┬──────────────────┤
│ LAYERS   │                                    │ INSPECTOR        │
│ ▣ Snow   │                                    │ Snow (clinical)  │
│ ▣ Fog    │          live preview              │ ── Look ──────── │
│ ▢ Pulse  │        (fills the pane)            │ Opacity   45 %   │
│          │                                    │ Size      1 px   │
│ + Add    │  [Light] [Dark] [Scene] [Photo]    │ Density   3 %    │
│          │                                    │ ── Timing ────── │
│          │                                    │ Rate      18 Hz  │
│          │                                    │ ── Colour ────── │
│          │                                    │ ── Mask ──────── │
└──────────┴────────────────────────────────────┴──────────────────┘
```

- **Top bar.** App name, preset picker (opens a gallery with thumbnails), master overlay switch, settings gear. Nothing else.
- **Layers pane (left, 240 px).** Layer cards with a type icon, name, one-line summary, visibility eye, drag handle. Drag to reorder. Right-click for duplicate, rename, delete. Add button opens the type gallery.
- **Preview (centre).** Fills the pane. Background chooser below it: light, dark, scene, and a user photo. A "1:1" toggle shows device pixels unscaled so a 1 px dot looks like a 1 px dot. A frame-rate readout in the corner.
- **Inspector (right, 300 px).** Parameters for the selected layer, grouped under Look, Timing, Colour, Motion, Mask, Modulation. Groups collapse. Only the groups that apply to the type are shown.

### 3.3 Controls

- **Slider row.** Label on the left, value with unit on the right. Click the value to type. Arrow keys step, Shift steps ten times, double-click resets to the type default. A thin tick shows the default position. Arcmin shown next to size on hover.
- **Colour.** Swatch plus tint amount in one row.
- **Select.** Segmented control when there are two to four options, dropdown otherwise.
- **Switch.** One style everywhere.
- No `prompt()` or native dialogs except the OS file picker for import and export.

### 3.4 Visual system

- **Type.** Inter (bundled), 13 px body, 11 px labels in uppercase with tracking, 20 px title. Tabular numerals for all values.
- **Spacing.** 4 px base. Panes 16 px padding. Rows 32 px tall. Groups separated by 24 px.
- **Colour tokens.** Surface, surface-raised, border, text, text-muted, accent, danger, in both light and dark. Accent is one blue. Danger is used only for Remove and Quit.
- **Icons.** Lucide, inline SVG, 16 px, one stroke weight. One icon per noise family, reused in the layer cards and the type gallery.
- **Motion.** 120 ms ease on hover and open. None if the OS asks for reduced motion.
- **Theme.** Follows the OS. A manual override in Settings.

### 3.5 Settings dialog

Opened from the gear. Tabs: General (FPS cap, keep on top, start at login, theme), Displays, Hotkeys (press-to-record, not typed strings), Calibration (diagonal, distance, result), Safety (flicker unlock), About (version, settings path, licence, links).

### 3.6 First run

A single screen: what the app does, the safety note, the two hotkeys, a Start button. Shown once.

### 3.7 Tray

Unchanged behaviour. Icon gets a proper design at 16, 22 and 32 px, with a dimmed variant for off.

## 4. Engineering notes

- Still one fragment shader. Type count moves the branch table from 10 to 36 entries. Branching on a uniform is cheap. Shader compile time on a slow integrated GPU must stay under 200 ms; if it does not, split into two programs (dots and fields) chosen per layer set.
- Masks and blends add one `vec4` of uniforms per layer. Modulation adds one. Layer uniform block grows from 4 to 6 `vec4` per layer.
- Thumbnails: one small WebGL canvas per gallery card is too many contexts. Render all thumbnails from one offscreen canvas into `<img>` tags, refreshed at 2 Hz while the gallery is open.
- Settings version bumps to 2. A migration maps 1.x layers to 2.0 with mask full, blend over, no modulation.
- Panel is still vanilla HTML and JS. No framework. CSS custom properties for every token. One stylesheet.

## 5. Out of scope

- Screen reading for background-aware polarity. Blend modes approximate it.
- Afterimage and trailing of real screen content. Needs screen reading.
- Touch or mobile.

## 6. Acceptance

- All 36 types render on light and dark in the preview and on the overlay, with a thumbnail each.
- A new user reaches a matched clinical preset in under a minute without reading the README.
- Panel passes a side-by-side with a current macOS or Windows settings app without looking out of place.
- No full-screen flashing above 3 Hz without the unlock.
- Idle GPU cost at 18 Hz clinical snow unchanged from 1.x.
