# KyivAlert — land-use collision detector

Finds Kyiv land parcels whose **registered legal purpose contradicts the public
place OpenStreetMap maps on the same ground**: an apartment block registered
inside a forest, retail inside a park, offices on a kindergarten's plot.

Two stages, as separate steps: a detector script that computes the collisions,
and a renderer that draws them.

**Current run: 4,404 flagged parcels out of 45,917 considered.**

These are *data inconsistencies requiring review*, not evidence of wrongdoing.
See [`data/spot_check.md`](data/spot_check.md) for the manual ground-truth and
the standing caveats.

## Setup

```bash
python3 -m venv .venv
./.venv/bin/pip install -r requirements.txt

# Preferred OSM source: one download, then everything runs locally.
curl -o data/ukraine.osm.pbf https://download.geofabrik.de/europe/ukraine-latest.osm.pbf
```

## Run

```bash
./.venv/bin/python -m src.run          # full pipeline
./.venv/bin/python -m src.run --skip-fetch   # recompute from cached data
./.venv/bin/python -m src.run --overpass     # use Overpass instead of the extract
```

First run scrapes 3,025 cadastre tiles (~15 min). Tiles are cached, so every
rerun is ~4 minutes end to end, including rereading the 872 MB extract.

## Data sources

**Cadastre** — `kadastrova-karta.com` Tegola vector tiles.

> The tile API returns **HTTP 403 without a `Referer: https://kadastrova-karta.com/`
> header.** That one header is the difference between working and not.

Layer `land_polygons` (z11–16), read at z15 over the Kyiv bbox: 3,025 tiles →
459,027 raw features → 394,752 unique parcels after `cadnum` dedupe. Attributes:
`cadnum`, `ownership`, `purpose`, `purpose_code`, `area`, `category`, `address`,
`auctions`, `land_sales`.

Parcels straddling a tile boundary appear clipped in each tile, so the pieces are
unioned per `cadnum`. Skipping this understates area by up to ~34%.

**OpenStreetMap** — 12,016 public places in nine classes (park, playground,
recreation, sport, forest, water, education, health, cemetery), plus the city
boundary from relation 421866.

Two interchangeable paths, both verified to produce identical boundary bounds:

- [`src/osm_pbf.py`](src/osm_pbf.py) — pyosmium over a Geofabrik extract. Default:
  ~2 minutes, deterministic.
- [`src/fetch_osm.py`](src/fetch_osm.py) — Overpass API, with mirror rotation and
  recursive bbox subdivision. Fallback, no download needed, but the public
  mirrors return 429s and 504s under load and this took hours in testing.

## How a collision is decided

All rules live in [`src/rules.py`](src/rules.py) and nowhere else.

1. **Ownership filter** — drop `Приватна власність` (86% of parcels; the expected
   background). Keeps `Комунальна`, `Державна`, `Не визначено`.
2. **Positive evidence required.** A collision needs either
   - a **development purpose** (`02.*` housing, `03.07` retail, `03.10` offices)
     registered on any public place — the strong signal; or
   - a **development land category** (civic, industrial, agricultural) on open
     green space (park, forest, water, recreation).

   Institutional grounds (school, hospital, cemetery, sports, playground) are
   never condemned by category alone — a military academy legitimately sits on
   land categorised *"…оборони…"*. A blank category is missing data, not a
   contradiction.
3. **Geometry floor** — overlap must exceed 100 m² *and* 10% of the parcel,
   computed in EPSG:32636. This discarded 10,857 of 15,913 intersecting pairs;
   without it, digitising slivers along shared edges are 68% of the output.
4. **Score 0–100** from overlap share, overlap size, evidence strength, place
   type, ownership, and whether the parcel is under auction or up for sale.

`data/purpose_codes.tsv` is written on every run: all 128 codes present in the
data with counts and sample text. The section numbering in these tiles does not
match the published KVCPZ ordering (`11.02` is manufacturing, `12.04` is road
transport), so codes are read from the data rather than assumed.

## Output

| file | what |
|---|---|
| `data/collisions.geojson` | flagged parcels, scored, with per-collision detail |
| `data/parcels.geojson` | all 394,752 parcels (full-city baseline, 380 MB) |
| `data/public_places.geojson` | the 12,016 OSM polygons |
| `data/purpose_codes.tsv` | every purpose code in the data, with counts |
| `web/index.html` | self-contained map page (10.3 MB) |

## The map

[`web/index.html`](web/index.html) is a single file — MapLibre, both fonts and all
three datasets inlined, because the Artifact CSP blocks every external request.
Filter by score, place type, ownership, district, or free text; click a parcel
for its full registry record, score breakdown, and deep links to both the
cadastral map and the OSM object.

`tools/shoot.py` renders it headless and fails on any console error:

```bash
./.venv/bin/python tools/shoot.py dark select
./.venv/bin/python tools/shoot.py light
```

## Courtesy

The cadastre scrape is ~3,000 requests against a small public service, at 8
workers, cached after the first run. Please don't parallelise it harder.

Data: OpenStreetMap contributors (ODbL) · kadastrova-karta.com
