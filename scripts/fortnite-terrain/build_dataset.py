#!/usr/bin/env python3
"""Builds the terrain datasets for the Fortnite Tactical Map tool.

Sources (clone these next to the peligaming repo, or pass --archives/--snakey):
  https://github.com/yaelbrinkert/fortnite-archives
      Datamined map dumps, updated per patch: 2048px minimap, world bounds in
      UE centimeters (map_meta.json), and POI/landmark markers with real x/y/z.
  https://github.com/SnakeyFlea/FortniteHeightmaps
      Datamined 16-bit landscape heightmaps up to Chapter 6 v34.20, with the
      UE Landscape import transforms documented in its README.

Outputs, per island, under public/tools/fortnite/data/<slug>/:
  heightmap.png   1024x1024 RGB; 16-bit height packed as R<<8|G (canvas-safe);
                  meters = zMin + v/65535*(zMax-zMin)
  watermask.png   1024x1024 8-bit; 255 = water surface
  texture.jpg     2048x2048 official minimap art
  meta.json       world bounds (UE cm), z range, POI anchors, credits

Islands:
  shattered-coast  Chapter 7 S4 "Override" (v42.00) - the live island.
                   Exact shape/water/bounds; the surface between the 65 real
                   elevation anchors is SYNTHESIZED (hydrology-based), so it is
                   labeled approximate. Swap in a real datamined heightmap here
                   the moment one is published, keeping the same meta format.
  hermes           Chapter 6 (v34.20) - fully datamined 16-bit heightmap, kept
                   as the accuracy reference / engine validation island.

Run:  python3 scripts/fortnite-terrain/build_dataset.py [--debug]
Deps: pip install pillow numpy scipy
"""

import argparse
import json
from pathlib import Path

import numpy as np
from PIL import Image
from scipy import ndimage as ndi

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "public/tools/fortnite/data"

N = 1024          # heightmap grid
TEX = 2048        # texture size


# ---------------------------------------------------------------- helpers

def water_from_minimap(rgb):
    """Boolean water mask from the stylized minimap art.

    Water on these maps is strongly blue-dominant with a low red channel
    (deep ocean ~(8,69,134), shallow ring ~(10,155,230)). The purple storm
    vortex has high red, snow has high everything - both excluded.
    """
    r = rgb[..., 0].astype(int)
    g = rgb[..., 1].astype(int)
    b = rgb[..., 2].astype(int)
    water = (r < 80) & (b > 100) & (b - r > 55) & (b >= g)
    water = ndi.binary_closing(water, iterations=2)
    # drop specks (map icons etc), fill pinholes inside water
    water = ndi.binary_opening(water, iterations=1)
    lab, n = ndi.label(~water)
    sizes = np.bincount(lab.ravel())
    small = (sizes < 40)[lab] & (lab > 0)
    return water | small


def ocean_of(water):
    # morphology can erode the exact edge rows, so sample a border band
    lab, _ = ndi.label(water)
    b = 8
    band = np.concatenate([lab[:b].ravel(), lab[-b:].ravel(),
                           lab[:, :b].ravel(), lab[:, -b:].ravel()])
    border = set(np.unique(band)) - {0}
    return np.isin(lab, list(border))


def hillshade(h, mpp):
    gy, gx = np.gradient(h, mpp)
    az, alt = np.radians(315), np.radians(45)
    slope = np.pi / 2 - np.arctan(np.hypot(gx, gy))
    aspect = np.arctan2(-gx, gy)
    hs = np.sin(alt) * np.sin(slope) + np.cos(alt) * np.cos(slope) * np.cos(az - aspect)
    return np.clip((hs + 1) / 2, 0, 1)


def encode_outputs(slug, h, water, tex_img, meta, debug):
    d = OUT / slug
    d.mkdir(parents=True, exist_ok=True)
    z0, z1 = float(h.min()), float(h.max())
    q = np.round((h - z0) / (z1 - z0) * 65535).astype(np.uint16)
    # pack 16-bit height into R (high byte) and G (low byte): browsers can
    # read 8-bit RGB losslessly via canvas, unlike 16-bit grayscale PNGs
    rgb = np.zeros((*q.shape, 3), np.uint8)
    rgb[..., 0] = q >> 8
    rgb[..., 1] = q & 0xFF
    Image.fromarray(rgb).save(d / "heightmap.png", optimize=True)
    Image.fromarray((water * 255).astype(np.uint8), mode="L").save(d / "watermask.png")
    tex_img.convert("RGB").save(d / "texture.jpg", quality=87)
    meta = dict(meta, zMin=round(z0, 2), zMax=round(z1, 2), waterLevel=0.0,
                heightmapSize=N, textureSize=TEX)
    (d / "meta.json").write_text(json.dumps(meta, indent=1))
    if debug:
        mpp = (meta["worldBounds"]["maxX"] - meta["worldBounds"]["minX"]) / 100 / N
        hs = (hillshade(h, mpp) * 255).astype(np.uint8)
        v = np.stack([hs, hs, hs], -1)
        v[water] = (v[water] * 0.4 + np.array([30, 90, 200]) * 0.6).astype(np.uint8)
        Image.fromarray(v).save(debug / f"{slug}_hillshade.png")
    print(f"[{slug}] wrote {d}  z=[{z0:.1f}..{z1:.1f}]m")


# ---------------------------------------------------------------- shattered coast

def build_shattered_coast(archives, debug):
    base = archives / "chapter_7/season_4/42_00"
    meta_maps = json.loads((base / "map_meta.json").read_text())
    br = next(m for m in meta_maps["maps"] if m["mode"] == "br")
    wb = br["worldBounds"]
    span_x = wb["maxX"] - wb["minX"]
    span_y = wb["maxY"] - wb["minY"]
    mpp = span_x / 100 / N  # meters per heightmap pixel

    minimap = Image.open(base / br["imageFile"]).convert("RGB")
    rgb = np.asarray(minimap)

    # --- real-data constraints -------------------------------------------
    water2k = water_from_minimap(rgb)
    water = np.asarray(
        Image.fromarray(water2k).resize((N, N), Image.NEAREST))
    ocean = ocean_of(water)
    lakes = water & ~ocean

    # elevation anchors: every unique POI/landmark marker across S3+S4 dumps
    anchors = {}
    poi_files = sorted(archives.glob("chapter_7/season_3/*/pois.json")) + \
        sorted(archives.glob("chapter_7/season_4/*/pois.json")) + \
        [archives / "latest/br_pois.json"]
    for f in poi_files:
        for e in json.loads(f.read_text()):
            if all(k in e for k in "xyz"):
                anchors[(round(e["x"]), round(e["y"]))] = e
    ax = np.array([(k[0] - wb["minX"]) / span_x * N for k in anchors])
    ay = np.array([(k[1] - wb["minY"]) / span_y * N for k in anchors])
    az = np.array([e["z"] / 100 for e in anchors.values()])  # cm -> m
    inside = (ax > 2) & (ax < N - 2) & (ay > 2) & (ay < N - 2)
    ax, ay, az = ax[inside], ay[inside], az[inside]
    az = np.maximum(az, 0.5)  # markers are ground-level; clamp odd negatives
    # merge anchors closer than 6 px (conflicting patch-to-patch duplicates)
    order = np.argsort(ax)
    keep_x, keep_y, keep_z = [], [], []
    used = np.zeros(len(ax), bool)
    for i in order:
        if used[i]:
            continue
        close = (np.hypot(ax - ax[i], ay - ay[i]) < 6) & ~used
        used |= close
        keep_x.append(ax[close].mean())
        keep_y.append(ay[close].mean())
        keep_z.append(az[close].mean())
    ax, ay, az = np.array(keep_x), np.array(keep_y), np.array(keep_z)
    print(f"[shattered-coast] {len(ax)} elevation anchors, "
          f"z {az.min():.0f}..{az.max():.0f} m")

    # --- synthesized surface ---------------------------------------------
    # base relief: rise with distance from any water (valleys along rivers,
    # ridges between channels) - the classic hydrology prior
    dist_m = ndi.gaussian_filter(
        ndi.distance_transform_edt(~water) * mpp, 2.5)
    ai, aj = ay.astype(int), ax.astype(int)
    d_at = np.maximum(dist_m[ai, aj], 1.0)
    ok = (d_at > 6) & (az > 2)
    p = np.clip(np.polyfit(np.log(d_at[ok]), np.log(az[ok]), 1)[0], 0.4, 1.0)
    a = np.exp(np.median(np.log(az[ok]) - p * np.log(d_at[ok])))
    h0 = a * np.maximum(dist_m, 0) ** p
    print(f"[shattered-coast] base fit h = {a:.2f} * d^{p:.2f}")

    # snow mountains (NW biome) carry extra relief
    snow2k = (rgb.min(-1) > 195) & (rgb.max(-1).astype(int) - rgb.min(-1) < 35)
    snow2k = ndi.binary_opening(snow2k, iterations=3)
    lab, n = ndi.label(snow2k)
    sizes = ndi.sum(snow2k, lab, range(1, n + 1))
    snow2k = np.isin(lab, [i + 1 for i, s in enumerate(sizes) if s > 3000])
    snow = np.asarray(Image.fromarray(snow2k).resize((N, N), Image.NEAREST))
    snow_f = ndi.gaussian_filter(snow.astype(float), 10)
    h0 = h0 * (1 + 1.3 * snow_f)

    # pull the surface through the real anchors (gaussian RBF on residuals)
    res = az - h0[ai, aj]
    sig = 55.0  # px  (~160 m)
    d2 = (ax[:, None] - ax[None, :]) ** 2 + (ay[:, None] - ay[None, :]) ** 2
    K = np.exp(-d2 / (2 * sig * sig)) + np.eye(len(ax)) * 0.05
    w = np.linalg.solve(K, res)
    gy, gx = np.mgrid[0:N, 0:N].astype(np.float32)
    R = np.zeros((N, N), np.float32)
    for k in range(len(ax)):  # 65 kernels, vectorized per-kernel
        R += w[k] * np.exp(-((gx - ax[k]) ** 2 + (gy - ay[k]) ** 2)
                           / (2 * sig * sig))
    h = h0 + R
    fit_err = np.abs(h[ai, aj] - az)
    print(f"[shattered-coast] anchor fit |err| mean {fit_err.mean():.2f} m, "
          f"max {fit_err.max():.2f} m")

    # water bodies: ocean gets a beach-to-seafloor profile, lakes sit at the
    # level of their lowest shore
    h = np.where(~water, np.maximum(h, 0.3), h)
    dist_land_m = ndi.distance_transform_edt(water) * mpp
    h = np.where(ocean, -(2 + 0.14 * dist_land_m), h)
    lab, n = ndi.label(lakes)
    ring_src = np.where(~water, h, np.nan)
    for i in range(1, n + 1):
        comp = lab == i
        ring = ndi.binary_dilation(comp, iterations=3) & ~water
        surf = np.nanpercentile(ring_src[ring], 15) if ring.any() else 1.0
        h = np.where(comp, max(surf, 0.2) - 0.4, h)
    h = np.where(water, h, ndi.gaussian_filter(h, 2.0))

    pois = [e for e in anchors.values()]
    meta = {
        "name": "Shattered Coast",
        "season": "Chapter 7 Season 4 · Override (v42.00)",
        "accuracy": "approx",
        "accuracyNote": (
            "Island shape, water network, world bounds and 65 elevation "
            "anchors are datamined; the surface between anchors is "
            "synthesized. Treat marginal sightlines with suspicion."),
        "worldBounds": wb,
        "pois": pois,
        "credits": [
            "map data: yaelbrinkert/fortnite-archives (datamined, v42.00)",
            "Fortnite is © Epic Games - fan-made, non-commercial tool"],
    }
    encode_outputs("shattered-coast", h.astype(np.float32), water,
                   minimap.resize((TEX, TEX), Image.LANCZOS), meta, debug)
    return meta


# ---------------------------------------------------------------- hermes (ch6)

def build_hermes(snakey, debug):
    d = snakey / "Chapter 6/34.20"
    v = np.asarray(Image.open(d / "Height_Hermes_Terrain.png")).astype(np.float32)
    # UE Landscape: height_cm = (v - 32768) * ZScale/128, ZScale=100 (repo README)
    h2k = (v - 32768.0) * (100.0 / 128.0) / 100.0
    h = np.asarray(Image.fromarray(h2k, mode="F").resize((N, N), Image.BILINEAR))
    # landscape frame: origin -130048 cm, 2048 px at 128 cm/px
    origin, size_cm = -130048.0, 2048 * 128.0
    wb = {"minX": origin, "maxX": origin + size_cm,
          "minY": origin, "maxY": origin + size_cm}

    water = h <= 0.02
    water = ndi.binary_opening(water, iterations=2)

    # register the minimap art onto the landscape frame by water alignment
    minimap = Image.open(d / "Minimap_Hermes_Terrain.png").convert("RGB")
    wm = water_from_minimap(np.asarray(minimap))
    S = 256
    wm_s = np.asarray(Image.fromarray(wm).resize((S, S), Image.NEAREST))
    hw_s = np.asarray(Image.fromarray(water).resize((S, S), Image.NEAREST))
    best = (0, 1.0, 0.0, 0.0)
    for s in np.arange(0.85, 1.16, 0.0125):
        for dx in np.arange(-0.10, 0.101, 0.0125):
            for dy in np.arange(-0.10, 0.101, 0.0125):
                yy, xx = np.mgrid[0:S, 0:S]
                u = ((xx / S - 0.5) * s + 0.5 + dx) * S
                vv = ((yy / S - 0.5) * s + 0.5 + dy) * S
                valid = (u >= 0) & (u < S) & (vv >= 0) & (vv < S)
                samp = np.zeros((S, S), bool)
                samp[valid] = wm_s[vv[valid].astype(int), u[valid].astype(int)]
                i = (samp & hw_s).sum() / max(1, (samp | hw_s).sum())
                if i > best[0]:
                    best = (i, s, dx, dy)
    iou, s, dx, dy = best
    print(f"[hermes] minimap registration IoU={iou:.3f} scale={s:.3f} "
          f"offset=({dx:+.3f},{dy:+.3f})")
    # resample the texture into the landscape frame
    yy, xx = np.mgrid[0:TEX, 0:TEX]
    u = ((xx / TEX - 0.5) * s + 0.5 + dx) * minimap.width
    vv = ((yy / TEX - 0.5) * s + 0.5 + dy) * minimap.height
    u = np.clip(u, 0, minimap.width - 1).astype(int)
    vv = np.clip(vv, 0, minimap.height - 1).astype(int)
    tex = Image.fromarray(np.asarray(minimap)[vv, u])

    meta = {
        "name": "Hermes",
        "season": "Chapter 6 (v34.20) · datamined reference island",
        "accuracy": "datamined",
        "accuracyNote": (
            "Real 16-bit landscape heightmap exported from the game files. "
            "Elevations and sightlines here are accurate (buildings and "
            "props excluded - this is the bare terrain)."),
        "worldBounds": wb,
        "pois": [],
        "credits": [
            "heightmap: SnakeyFlea/FortniteHeightmaps (datamined, v34.20)",
            "Fortnite is © Epic Games - fan-made, non-commercial tool"],
    }
    encode_outputs("hermes", h.astype(np.float32), water, tex, meta, debug)
    return meta


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--archives", type=Path,
                    default=Path("/home/user/yaelbrinkert/fortnite-archives"))
    ap.add_argument("--snakey", type=Path,
                    default=Path("/home/user/snakeyflea/fortniteheightmaps"))
    ap.add_argument("--debug", type=Path, default=None,
                    help="directory for hillshade/QA previews")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    m1 = build_shattered_coast(args.archives, args.debug)
    m2 = build_hermes(args.snakey, args.debug)
    manifest = [
        {"slug": "shattered-coast", "name": m1["name"], "season": m1["season"],
         "accuracy": m1["accuracy"], "default": True},
        {"slug": "hermes", "name": m2["name"], "season": m2["season"],
         "accuracy": m2["accuracy"]},
    ]
    (OUT / "islands.json").write_text(json.dumps(manifest, indent=1))
    print("wrote", OUT / "islands.json")


if __name__ == "__main__":
    main()
