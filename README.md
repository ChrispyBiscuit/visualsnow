# Visual Snow Relief Kit

A free, open source desktop overlay that draws visual snow, grain and static over your whole screen. Always on top, click-through, on every display. Ten noise types, up to eight stacked layers, defaults taken from published visual snow research, a live control panel, tray icon and hotkeys.

Windows, macOS and Linux. No installer. Unzip and run. Apache 2.0 licence.

**Download:** see the [Releases](../../releases) page.

---

## What it is for

**Showing someone what you see.** Visual snow is hard to describe. "Like TV static, but on everything" never lands. Put the overlay on, hand them the mouse, and they see it on their own desktop, over their own windows, while they work. Adjust the sliders until it matches yours.

**Matching and recording your own snow.** The Clinical preset starts at the published averages. The Calibration card converts pixel size to arcminutes for your screen and viewing distance, so your settings mean the same thing on any screen. Export the result as JSON and keep it. Compare it month to month, or bring it to an appointment.

**Clinic and research demos.** Clinicians and researchers can show the full range of reported snow on any laptop: black-and-white, coloured, transparent, flashing, with floaters, with afterglow. No special hardware.

**Habituation and masking.** Some people with visual snow report that a controlled, steady noise field is easier to live with than the one their brain makes, and that time spent with a matched simulation makes their own snow less intrusive. The app makes that experiment easy and reversible. This is not a treatment claim. There is no clinical evidence that overlays treat visual snow syndrome. Stop if it makes things worse.

**Comfort, focus and style.** Film grain and soft static reduce the flat, hard look of large bright screens for some people. Others just like the look. The grain, CRT and mosaic presets are for that.

**Testing and accessibility work.** Designers can check whether an interface still reads with 3 percent dynamic noise over it, the way a person with visual snow sees it.

## What the research says, and how it set the defaults

The defaults are not guesses. They come from studies that asked people with visual snow syndrome to tune a simulation until it matched what they see.

| Property | Finding | Default |
|---|---|---|
| Dot size | Under 2 arcmin of visual angle. The most consistent property between people. | 1 device pixel. The panel reports what that is in arcmin for your screen. |
| Refresh rate | Mean 18.2 Hz, with wide spread between people. | 18 Hz |
| Density | About 2.9 percent of the field is a dot at any instant. | 3 percent |
| Contrast | Very low, about 2.6 percent RMS. | Opacity 45 percent on 1 px dots, which lands near that after display blending. |
| Colour | Black-and-white most common (58 to 65 percent of patients), then transparent (41 to 54), flashing (44 to 50), coloured (23 to 40). Many report more than one. | Dark and light dots mixed. Other types are separate layers and presets. |
| Related percepts | Floaters and small moving objects against bright backgrounds, afterimages and trailing, coloured swirls with eyes closed. | Floaters, Sparkle and Fog layers. |
| Visibility | Worse in dim rooms and on dark, plain backgrounds. | The Dim room preset. |

Sources: a 2024 matching study of 31 people with VSS (University of Minnesota); the University of Melbourne visual snow research programme; Viana et al. 2020, European Journal of Neurology; Puledda, Schankin and Goadsby 2020, Neurology; Schankin et al. 2014, Brain; Lauschke et al. 2016. Links are in `PRD.md`.

## Design method

**One shader, many layers.** Every noise type is a branch in a single WebGL 2 fragment shader. Up to eight layers are drawn in one pass, composited front to back with premultiplied alpha. There are no textures, no particles and no CPU work per frame. A full 4K display costs one fullscreen draw.

**Hash noise, not random numbers.** Every dot is a pure function of its cell, its frame number and a seed, computed with a PCG integer hash. The same settings give the same picture on every machine, every display and in the preview. Two displays never show the same pattern because each layer has a seed.

**Exact update rates.** Research reports snow in hertz, so the app works in hertz. A layer's frame number is `floor(time × rate)`. An 18 Hz layer changes 18 times a second whatever the monitor refresh is. The renderer checks whether any layer's frame number changed and skips the draw if not. A pure snow stack at 18 Hz draws 18 frames a second, not 60 or 144.

**Asynchronous cells.** Real snow does not refresh in lockstep. Snow, shimmer, chroma and sparkle layers give each cell its own phase offset, so dots appear and vanish on their own clocks. TV static keeps the lockstep refresh, because that is what static looks like.

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

## Hotkeys

- `Ctrl+Alt+V` (`Cmd+Alt+V` on macOS): overlay on or off
- `Ctrl+Alt+Shift+V`: open the control panel

Both can be changed in the panel.

## Noise types

| Type | Look | Starting values |
|---|---|---|
| Snow (clinical) | Sparse tiny dots, dark and light | 1 px, 18 Hz, 3 %, opacity 45 % |
| TV static | Dense grey noise | 1 px, 30 Hz, contrast 90 %, opacity 20 % |
| Film grain | Dense soft grain, bell-shaped | 2 px, 24 Hz, contrast 70 %, opacity 25 % |
| Colour chroma | Random saturated colour dots | 1 px, 15 Hz, 2 % |
| Transparent shimmer | Faint mid-grey dots | 2 px, 14 Hz, 8 %, opacity 18 % |
| Flashing sparkles | Rare bright dots that pop and fade | 3 px, 2 Hz, 0.4 % |
| Floaters | Soft blobs that wander | 6 px, 0.4 Hz, 15 % |
| Fog swirl | Large slow clouds | 300 px, 0.15 Hz |
| Scanlines | Flickering horizontal lines | 3 px, 60 Hz |
| Pulse | Whole-screen slow brightening | 0.8 Hz, opacity 5 % |

Each layer also has tint colour, tint amount, softness, drift and seed.

## Settings file

Portable mode: if the folder the app runs from is writable, settings are saved there as `visual-snow-settings.json`. Otherwise they go to the user profile. The panel shows the path. Export and Import move layer sets between machines as JSON.

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

Flicker can trigger migraine or, rarely, seizures in people who are sensitive to it. Start with low opacity. The Pulse and Sparkle types and high-contrast static at 10 to 30 Hz are the ones to be careful with. If you have photosensitive epilepsy, do not use this app. Nothing here is medical advice.

## Author

Made by Chris Villarreal. [LinkedIn](https://www.linkedin.com/in/LINKEDIN-HANDLE) · [GitHub](https://github.com/ChrispyBiscuit)

Issues and pull requests are welcome.

## Licence

Apache License 2.0. See `LICENSE`. Free to use, copy, change and redistribute, including commercially, with attribution.
