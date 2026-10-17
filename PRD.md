# Visual Snow Relief Kit — Product Requirements Document

Version 1.0 · 2026-10-17

## 1. Purpose

Build a desktop app that draws animated noise (grain, static, snow) over the whole screen at all times. The noise sits above every window. The mouse and keyboard pass through it. The user controls the noise from a control panel and a tray icon.

The app replaces older "visual snow" overlay tools. Those tools have one noise type, one platform, and few settings. This app has many noise types, runs on Windows, macOS and Linux from one zip file per platform, and has a modern control panel.

## 2. Who uses it

- People with visual snow syndrome (VSS) who want to show others what they see, or who want to match and record their own snow.
- Clinicians and researchers who want a quick, tunable simulation on any screen.
- People who want a film-grain or static look on their desktop for comfort, focus, or style.

## 3. What the research says

The numbers below set the defaults for the "Clinical match" preset.

| Property | Finding | Source |
|---|---|---|
| Dot size | Under 2 arcmin of visual angle. At 60 cm from a 96 DPI screen, one pixel is about 1.5 arcmin. So dots are 1 to 2 device pixels. Size was the most consistent property between people. | Matching study, 31 people with VSS (Univ. of Minnesota, 2024); Univ. of Melbourne research summary |
| Refresh rate | Mean 18.2 Hz. Varies between people. | Same matching study |
| Density | Mean 2.87 percent of the field is a dot at any moment. | Same |
| Contrast | Mean RMS contrast 2.56 percent. Very low. | Same |
| Colour type | Black-and-white most common (58 to 65 percent of patients). Transparent 41 to 54 percent. Flashing 44 to 50 percent. Coloured 23 to 40 percent. Many report more than one type. | Viana et al. 2020; Puledda, Schankin, Goadsby 2020 |
| Related percepts | Afterimages and trailing (palinopsia), small moving objects against bright backgrounds (57 percent), coloured swirls with eyes closed (41 percent). | Schankin et al. 2014; Lauschke et al. 2016 |
| Visibility | Snow is more visible in dim rooms and on dark or plain backgrounds. | Clinical diary study |

Design result: the app must support very small dots (1 px), rates from under 1 Hz to 60 Hz, sparse density (1 to 5 percent), low contrast, and both dark and light dots at the same time. It must also offer the other types patients report.

## 4. Scope

### 4.1 Noise types (layers)

Each type is a layer. The user stacks any number of layers (limit 8). Every layer has: on/off, opacity, grain size (device pixels), update rate (Hz), density, contrast, colour tint, drift speed, softness, seed.

| # | Type | What it looks like | Key parameters |
|---|---|---|---|
| 1 | Snow (clinical) | Sparse tiny dots, mix of dark and light, each dot refreshes at its own time | size, rate, density, polarity (dark / light / both) |
| 2 | TV static | Dense grey noise over the full screen, all cells update together | size, rate, contrast |
| 3 | Film grain | Dense soft grain with a bell-shaped brightness spread, like cine film | size, rate, contrast |
| 4 | Colour chroma | Dots with random saturated colours | size, rate, density |
| 5 | Transparent shimmer | Faint mid-grey dots that read as a shimmer rather than as black or white | size, rate, density |
| 6 | Flashing sparkles | Rare bright dots that pop and fade | size, rate (fade time), density |
| 7 | Floaters | Small soft blobs that drift slowly and randomly | size, rate (movement speed), density |
| 8 | Fog swirl | Large slow clouds, like swirls seen with eyes closed | size (cloud scale), rate, contrast |
| 9 | Scanlines | Horizontal line pattern that flickers and can roll | size (line pitch), rate, drift |
| 10 | Pulse | The whole screen brightens and dims in a slow rhythm | rate, opacity |

### 4.2 Overlay behaviour

- Covers every connected display, or only the displays the user picks.
- Always on top. Click-through. Does not take focus. Not in the taskbar or dock.
- Follows display changes (plug, unplug, resolution, scale).
- Runs on the GPU (WebGL 2). Draws a frame only when a layer changes, up to a user-set FPS cap.
- Toggle on/off with a global hotkey and from the tray.

### 4.3 Control panel

- One window with: on/off switch, preset picker, layer list, per-layer controls, general settings.
- Live preview on a light, dark, or photo-like background.
- Presets: built-in list plus user presets. Export and import as JSON.
- Calibration: enter screen diagonal and viewing distance. The panel shows each layer's dot size in arcmin so a user can match the research numbers.
- General settings: FPS cap, global opacity, displays, hotkeys, start at login.
- Closing the panel hides it to the tray. Quit is in the tray menu and the panel.

### 4.4 Portability

- Electron app. One zip per platform: Windows x64, macOS (Intel and Apple Silicon), Linux x64.
- No installer. Unzip and run.
- Portable mode: if the app folder is writable, settings live next to the executable. Otherwise in the user profile.

### 4.5 Out of scope for 1.0

- Reading the screen under the overlay (needed for true "dark on light, light on dark" dot polarity). Random polarity is used instead.
- Mobile versions.
- Code signing and app store distribution.

## 5. Known platform limits

- Windows: the overlay does not show over exclusive full-screen games. Borderless windowed games are fine.
- macOS: first run of an unsigned app needs right-click, Open, or `xattr -cr` on the app. The overlay shows over full-screen apps.
- Linux: needs a compositor (most X11 desktops). On Wayland, always-on-top and click-through depend on the desktop; GNOME Wayland is not fully supported.

## 6. Success criteria

- A person with VSS can match their snow with the Clinical preset and two slider changes.
- Idle GPU use on a 1080p display under 5 percent on an integrated GPU at 18 Hz snow.
- Unzip to running overlay in under 30 seconds on all three platforms.
- Every layer type visible in the preview and on the overlay with the same look.

## 7. Architecture

```
main.js        Electron main: windows, tray, hotkeys, settings file, IPC hub
preload.js     Safe bridge (contextIsolation)
noise.js       Shared WebGL2 renderer, one shader pass for up to 8 layers
overlay.html   Transparent click-through window, one per display
panel.html     Control panel UI (vanilla HTML/CSS/JS)
presets.js     Built-in presets and the default settings object
```

Settings are one JSON object. The panel edits it, sends it to main. Main saves it and broadcasts it to all overlays. Overlays apply it on the next frame.
