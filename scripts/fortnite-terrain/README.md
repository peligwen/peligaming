# Fortnite terrain data pipeline

Generates the datasets under `public/tools/fortnite/data/` for the Tactical
Terrain tool. Committed outputs are current for **Chapter 7 Season 4
(v42.00, "Override")** — re-run after a map-changing patch.

## Refresh steps

```sh
git clone --depth 1 https://github.com/yaelbrinkert/fortnite-archives ../fortnite-archives
git clone --depth 1 https://github.com/SnakeyFlea/FortniteHeightmaps ../fortniteheightmaps
pip install pillow numpy scipy
python3 scripts/fortnite-terrain/build_dataset.py \
  --archives ../fortnite-archives --snakey ../fortniteheightmaps
```

Then commit the regenerated `public/tools/fortnite/data/`.

## How accurate is the terrain?

Per island, `meta.json → accuracy` is either:

- **`datamined`** — a real 16-bit landscape heightmap exported from the game
  files (currently the Chapter 6 island; nobody has published one for the
  Chapter 7 island yet).
- **`approx`** — island shape, water network, world bounds and the POI
  elevation anchors are all datamined and exact; the surface *between*
  anchors is synthesized from hydrology (distance-from-water base + RBF fit
  through the anchors, ~1.7 m mean error at the anchors themselves).

The moment a real Chapter 7 heightmap export surfaces (watch the two source
repos above), drop it into `build_dataset.py` the way `build_hermes` does and
the tool picks it up unchanged — the format is the contract, not the source.

`heightmap.png` packs 16-bit height into R (high byte) / G (low byte) of a
plain RGB PNG so browsers can decode it losslessly through a canvas.
