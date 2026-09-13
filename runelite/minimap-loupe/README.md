# Minimap Loupe

A [RuneLite](https://runelite.net) plugin: hold the cursor over the minimap
and a small circle of it is magnified under the pointer, the way a loupe sits
on a map.

Developed in [peligwen/peligaming](https://github.com/peligwen/peligaming)
under `runelite/minimap-loupe/`, and mirrored to
[peligwen/minimap-loupe](https://github.com/peligwen/minimap-loupe) whose root
is this project — the shape RuneLite's Plugin Hub builds from. Changes go to
the first and are split out to the second; a commit made only on the mirror
would be lost at the next split.

- The lens follows the cursor and shows the patch of map beneath it, enlarged
  110%–800%, in a circle 16–200 px across.
- It can sit **on the cursor** like a magnifying glass, or be **parked beside
  the minimap** so the map is never covered by the thing reading it.
- Smoothing (bilinear) or hard pixel blocks, a rim you can colour or turn off,
  an optional crosshair marking the exact point under the pointer.
- Optionally bound to a key: hold it to raise the lens, let go to drop it.
  Unbound, the lens is up whenever the cursor is over the map.

## What it can and cannot do

The client rasterises the minimap once, at one scale, into the frame buffer.
There is no second, sharper copy to enlarge — so this magnifies *pixels that
are already on your screen*. It makes a crowded dot cluster or a cramped icon
readable; it does not reveal anything the client had not already drawn, and
past about 400% you are looking at large squares rather than more detail.

Everything it magnifies is read back out of the finished frame, which is also
why it picks up the minimap drawing other plugins do — their dots and markers
are in the frame by the time the lens reads it.

Two consequences worth knowing:

- **Off the edge of the map.** The lens only shows map. Where its circle
  reaches past the edge of the minimap disc it fills with flat dark, rather
  than magnifying the interface around the map.
- **The lens and its own output.** Anchored to the cursor, the lens is drawn
  over the patch it read. The client redraws the minimap every frame, so it
  reads fresh pixels each time — but if you ever see it magnifying itself,
  park it beside the minimap, where it never covers what it reads.

## Installing

The built jar is served from
**[gaming.peliglot.com/tools/runescape/minimap-loupe](https://gaming.peliglot.com/tools/runescape/minimap-loupe)**,
which has the current download, its checksum, and the click-by-click install.
The short version: drop the jar in `~/.runelite/sideloaded-plugins/` (on
Windows, `%USERPROFILE%\.runelite\sideloaded-plugins\`) and start RuneLite
with `--developer-mode` in the launcher's *Client arguments*. The plugin then
appears in the sidebar as **Minimap Loupe**.

## Building

Java 11 or newer and Gradle:

```sh
gradle test      # the lens maths and a headless render of the overlay
gradle jar       # build/libs/minimap-loupe-<version>.jar — the sideload jar
gradle run       # a development client with the plugin loaded
```

From the site repository, `npm run build:plugin` does the same build and
copies the jar (with its checksum) into `public/plugins/minimap-loupe/`.

## Plugin Hub readiness

This directory is a complete Plugin Hub submission as it stands: the project
is at its own root, with `runelite-plugin.properties`, `LICENSE`, `icon.png`
and `src/main/` where the hub's packager looks for them, `build=standard` (no
third-party dependencies, so its build file is the hub's own), Java 11
bytecode, its own package namespace, and no terminally deprecated API — it
uses `net.runelite.api.gameval.InterfaceID` rather than the disallowed
`WidgetInfo`/`WidgetID`. The hub's standard build has been run against it
locally and produces an 11 KB jar.

The repository whose *root* is this project — which is what the packager
clones and builds — is the mirror above. A listing is then a one-file PR to
[runelite/plugin-hub](https://github.com/runelite/plugin-hub): a
`plugins/minimap-loupe` naming that repository and the commit to build.

## Layout

| | |
|---|---|
| `MinimapLoupePlugin` | registers the overlay, and holds the hotkey gate |
| `MinimapLoupeConfig` | the panel: zoom, radius, anchor, smoothing, rim, crosshair, hotkey |
| `MinimapLoupeOverlay` | finds the minimap in whichever layout is loaded, reads the frame, paints the lens |
| `Loupe` | the magnification itself — which pixels to copy, and where to put them |
| `Disc` | the round map inside the square widget |

## Licence

MIT — the same licence as
[peligaming](https://github.com/peligwen/peligaming), the repository this
plugin is developed in. Not affiliated with Jagex or RuneLite. It draws only what the client has
already drawn — no automation, and no information the game did not put on
screen.
