# Visual Snow Relief Kit

A free, open source desktop overlay that draws visual snow, grain and static over your whole screen. Always on top, click-through, on every display. 37 noise types in six families, up to eight stacked layers, 28 presets, defaults taken from published visual snow research, a live control panel, tray icon and hotkeys.

Windows, macOS and Linux. No installer. Unzip and run. Apache 2.0 licence.

**Download:** see the [Releases](../../releases) page.

![The control panel](docs/images/panel.png)

**Feature overview with screenshots of every screen, type and preset:** [docs/FEATURES.md](docs/FEATURES.md)

---

## What it is for


**Habituation and masking.** Some people with visual snow report that a controlled, steady noise field is easier to live with than the one their brain makes, and that time spent with a matched simulation makes their own snow less intrusive. The app makes that experiment easy and reversible. This is not a treatment claim. There is no clinical evidence that overlays treat visual snow syndrome. Stop if it makes things worse.

**Comfort, focus and style.** Film grain and soft static reduce the flat, hard look of large bright screens for some people.

## What the research says, and how it set the defaults

The defaults are not guesses. They come from studies that asked people with visual snow syndrome to tune a simulation until it matched what they see.

| Property | Finding | Default |
|---|---|---|
| Dot size | Under 2 arcmin of visual angle. The most consistent property between people. | 1 device pixel. The panel reports what that is in arcmin for your screen. |
| Refresh rate | Mean 18.2 Hz, with wide spread between people. | 18 Hz |
| Density | About 2.9 percent of the field is a dot at any instant. | 3 percent |
| Contrast | Very low, about 2.6 percent RMS. | Opacity 45 percent on 1 px dots, which lands near that after display blending. |
| Colour | Black-and-white most common (58 to 65 percent of patients), then transparent (41 to 54), flashing (44 to 50), coloured (23 to 40). Many report more than one. | Dark and light dots mixed. Other types are separate layers and presets. |
| Related percepts | Floaters and small moving objects against bright backgrounds, afterimages and trailing, coloured swirls with eyes closed. | Floaters, Squiggles, Phosphenes, Marbled swirl and Sparkle layers. |
| Distribution | Many describe snow as an even texture. Some report it denser at the edges of vision or coming in waves. | Even snow, Patchy snow and Bursts types. Edge masks. Slow modulation. |
| Visibility | Worse in dim rooms and on dark, plain backgrounds. | The Dim room preset. |

Sources: a 2024 matching study of 31 people with VSS (University of Minnesota); the University of Melbourne visual snow research programme; Viana et al. 2020, European Journal of Neurology; Puledda, Schankin and Goadsby 2020, Neurology; Schankin et al. 2014, Brain; Lauschke et al. 2016. Links are in `PRD.md`.

## Design method

**One pass, many layers.** Up to eight layers are drawn in one fullscreen WebGL 2 pass, composited with premultiplied alpha. There are no textures, no stored particles and no CPU work per frame.

**Shaders built to order.** Every type is written as one case of a shader switch. The renderer compiles a program that holds only the types you are using, and caches it. A snow-only stack runs a snow-only shader. This keeps the cost per pixel flat as the catalog grows, and it matters most without a GPU: on software rendering, in virtual machines and remote desktops, a shader holding all 37 types takes seconds to compile and runs every branch for every pixel.

**Hash noise, not random numbers.** Every dot is a pure function of its cell, its frame number and a seed, computed with a PCG integer hash. The same settings give the same picture on every machine, every display and in the preview. Two displays never show the same pattern because each layer has a seed.

**Exact update rates.** Research reports snow in hertz, so the app works in hertz. A layer's frame number is `floor(time × rate)`. An 18 Hz layer changes 18 times a second whatever the monitor refresh is. The renderer checks whether any layer's frame number changed and skips the draw if not. A pure snow stack at 18 Hz draws 18 frames a second, not 60 or 144.

**Asynchronous cells.** Real snow does not refresh in lockstep. Dot layers give each cell its own phase offset, so dots appear and vanish on their own clocks. The renderer draws three times per layer period for these, so the rolling change is visible. TV static keeps the lockstep refresh, because that is what static looks like.

**Moving things without storing them.** Floaters, squiggles, ripples, phosphenes, bokeh and flow particles are computed per pixel from a region id and the time, never stored. A floater's position is smooth noise of time. A flow particle is traced along an analytic curl field from its spawn point. Nothing accumulates, so nothing drifts or leaks over a long session.

**Device pixels, converted to angle.** Grain size is in device pixels because that is what the GPU draws. Visual angle is what the research measures. The Calibration card does the conversion from your screen diagonal and viewing distance, so a 1 px dot on a 4K 27 inch display and a 2 px dot on a 1080p 27 inch display read as the same thing.

**Both polarities at once.** The overlay cannot see the screen under it. It cannot draw dark dots on light areas and light dots on dark areas, the way most people report. Instead it draws both polarities at random. On a light background the dark dots show, on a dark background the light dots show, and the density stays right either way. A polarity switch forces one kind when that is what you see.

**Presets are layer stacks.** A preset is a list of layers, nothing more. User presets, exports and the built-in list share one format, so anything you build can be saved, shared and loaded on another machine.

**Settings are one JSON object.** The panel edits it, the main process saves it and broadcasts it, the overlays apply it on the next frame. There is no other state. Portable mode keeps the file next to the executable when that folder is writable.

**Boring platform choices on purpose.** Electron, vanilla HTML, no framework, no native modules. That is what makes one code base run on three operating systems from a zip with no installer and no build step on the user's machine.

## Install

There is no installer. The zip is the app.

### Windows

1. Download `VisualSnowReliefKit-windows-x64.zip` from [Releases](../../releases).
2. Right-click the zip, choose "Extract All", and pick a folder you can write to, for example `C:\Apps\Visual Snow Relief Kit` or your Desktop. Do not run it from inside the zip.
3. Open the folder and double-click `Visual Snow Relief Kit.exe`.
4. SmartScreen will warn because the app is not signed. Click "More info", then "Run anyway". This happens once.
5. The control panel opens and the overlay is on. Close the panel and the app keeps running in the tray, next to the clock.
6. Optional: in the panel, turn on "Start at login".

To uninstall, quit from the tray and delete the folder. Settings live in `visual-snow-settings.json` in that folder.

### macOS

1. Download `VisualSnowReliefKit-macos-arm64.zip` for Apple Silicon (M1 and later) or `VisualSnowReliefKit-macos-x64.zip` for Intel.
2. Double-click the zip to unpack it. Drag `Visual Snow Relief Kit.app` to Applications, or anywhere you like.
3. Right-click the app, choose Open, then Open again in the dialog. This is needed once because the app is not signed.
4. If macOS says the app is damaged or cannot be opened, open Terminal and run:
   ```
   xattr -cr "/Applications/Visual Snow Relief Kit.app"
   ```
   then open it again.
5. The app runs from the menu bar. There is no Dock icon.
6. Optional: turn on "Start at login" in the panel.

To uninstall, quit from the menu bar icon and move the app to the Trash. Settings are in `~/Library/Application Support/Visual Snow Relief Kit`.

### Linux

1. Download `VisualSnowReliefKit-linux-x64.zip`.
2. Unzip it:
   ```
   unzip VisualSnowReliefKit-linux-x64.zip -d ~/Apps
   cd ~/Apps/"Visual Snow Relief Kit-linux-x64"
   ./run.sh
   ```
3. Needs X11 with a compositing window manager. Most desktops qualify. On Wayland, always-on-top and click-through depend on the desktop and may not work.
4. If you see a sandbox error, run `./run.sh --no-sandbox` or set the owner and setuid bit on `chrome-sandbox` as the message says.
5. For start at login, add `run.sh --hidden` to your desktop's startup applications.

To uninstall, quit from the tray and delete the folder.

### From source

```
git clone https://github.com/ChrispyBiscuit/visualsnow.git
cd visualsnow
npm install
npm start
```

## The control panel

The panel uses a studio-hardware look: a dark matte faceplate, raised plates, a recessed display, one warm amber accent, large dials and the Barlow typeface.

- **Header.** Step through presets with the arrows, or click the name to open the preset gallery with live thumbnails. Save and Delete work on your own presets. The Overlay switch turns the overlay on or off.
- **Layers plate** on the left. The amber light shows a layer is on; click it to hide the layer. Double-click a name to rename it. Drag to reorder. Right-click for more. The Master dial sets the strength of all layers together.
- **Display** in the centre. It shows the result on a dark, light, desktop-scene or photo background, with live readouts of size (in pixels and arcminutes), rate, density and opacity. 1:1 shows real screen pixels; 2× and 4× zoom in.
- **Layer plate.** Layer type, dot polarity and Show (all, lights, darks) along the top. Four large dials for the main settings, then small dials for the type's own settings.
- **Advanced plate**, switched on in the layer plate. Tint colour, mask area, vary over time and schedule along the top, and dials for tint, drift, mask and variation below.

![The Advanced plate](docs/images/panel-advanced.png)

Dials: drag up or down, hold Shift for fine control, scroll, or use the arrow keys (Shift for bigger steps, Home and End for the limits). Double-click a dial or its label to reset it. Click the value to type one.

## Hotkeys

- `Ctrl+Alt+V` (`Cmd+Alt+V` on macOS): overlay on or off
- `Ctrl+Alt+Shift+V`: open the control panel

Both can be changed in the panel.

## Noise types

37 types in six families. Each has its own defaults and, where it needs them, its own pattern settings.

| Family | Types |
|---|---|
| **Dots**, the visual snow core | Snow · Even snow (no clumps) · Fixed shimmer (dots stay put and twinkle) · Pulsing dots · Patchy snow · Falling snow · Bursts · Colour dots · Transparent · Flashing sparkles |
| **Grain & static** | TV static · Film grain (mono or colour) · Fine blue-noise grain · Halftone · Ordered dither · Dust & scratches · VHS tracking · Interlace |
| **Fields** | Fog · Marbled swirl · Cells (bubbles or mesh) · Ripples · Interference (moiré) · Plasma |
| **Floaters & shapes** | Floaters · Squiggles (worm-like vitreous floaters) · Phosphenes · Flow particles · Bokeh |
| **Flicker** | Pulse · Flicker · Breathing vignette · Strobe |
| **Lines & structure** | Scanlines · Grid (square or hex) · Rain streaks · Checker flicker |

Every layer, whatever its type, also has:

| Feature | What it does |
|---|---|
| Tint | Colour and amount. |
| Show | All, lights only, or darks only. Lights only shows on dark parts of the screen, darks only on light parts. |
| Drift | Constant motion in pixels per second. |
| Mask | Full screen, centre, edges, left, right, top or bottom, with size and feather. Use Edges for snow that is worse in peripheral vision, or Centre-clear to keep a reading area clean. |
| Modulation | Slowly raises and lowers opacity, density or rate over a cycle of 5 seconds to 15 minutes. |
| Schedule | Shows the layer only between two times of day. |
| Refresh lock | Snaps the rate to an even divisor of your display refresh, which removes beating. |
| Seed | A new random pattern with the same settings. |

## Presets

| Group | Presets |
|---|---|
| Clinical | Clinical match · Clinical, even texture · Clinical, strong · Worse at the edges |
| Reported variants | Black and white · Transparent · Flashing · Coloured · Screen door · Waves of static · Bright sky · Eyes closed · Dim room · Full syndrome |
| Analog media | Cine film · Old CRT · VHS tape · Newsprint · 1-bit dither |
| Ambient & calm | Soft grain · Snowfall · Drift · Night lights |
| Demo & extreme | Dead channel · Big pixel mosaic · Moiré · Plasma · Storm |

## Settings file

Portable mode: if the folder the app runs from is writable, settings are saved there as `visual-snow-settings.json`. Otherwise they go to the user profile. Settings, About shows the path. Export and Import move layer sets between machines as JSON. Settings and presets from 1.x are upgraded automatically on first start.

## Build from source

```
npm install
npm start            # run from source
npm run build        # zips for all platforms into dist/
npm run build:win    # one platform: win32, darwin or linux
```

Needs Node 18 or newer and `zip` on the PATH. Builds for every platform from any platform.

## Limits

- Windows: not visible over exclusive full-screen games. Borderless windowed games are fine.
- macOS: shows over full-screen apps. The app is not signed, so the first launch needs the steps above.
- Linux: X11 with a compositor works. Wayland support depends on the desktop.
- The overlay cannot see the screen under it, so dot polarity is random rather than background-aware.

## Safety

Flicker can trigger migraine or, rarely, seizures in people who are sensitive to it. Start with low opacity. If you have photosensitive epilepsy, do not use this app. Nothing here is medical advice.

- The whole-screen types, Pulse, Flicker and Strobe, are held to 3 flashes a second, the level accessibility guidelines (WCAG 2.3.1) warn about. Flicker may go faster only at 10 % depth or less. The cap includes rate modulation.
- The cap can be lifted in Settings, Safety, after a warning.
- Adding a Strobe layer asks first. No built-in preset uses Strobe.
- Thumbnails of flicker types are drawn still.
- Dot types are not capped. Research snow is 18 Hz over 3 % of the field, far below the area that counts as a flash.

## Third-party

Inter font (SIL Open Font License 1.1) and Lucide icons (ISC licence) are bundled. See `THIRD_PARTY_NOTICES.md`.

## Author

Made by Chris Villarreal. [LinkedIn](https://www.linkedin.com/in/chris26/) · [GitHub](https://github.com/ChrispyBiscuit)

Issues and pull requests are welcome.

## Licence

Apache License 2.0. See `LICENSE`. Free to use, copy, change and redistribute, including commercially, with attribution.
