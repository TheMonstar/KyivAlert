# Spot check — manual ground-truth of the top hits

Run of 2026-08-08. Cadastre tiles at z15, OSM from the Geofabrik Ukraine extract.
4,404 flagged parcels out of 45,917 considered.

## 1. Geometry validation (automated, all top 10)

The cadastre publishes its own `area` value per parcel, independent of the tile
geometry. Recomputing the area from the decoded polygons in EPSG:32636 and
comparing is a hard check on the whole decode path:

| cadnum | declared ha | computed ha | diff |
|---|---|---|---|
| 8000000000:62:457:0006 | 7.3859 | 7.384 | −0.0% |
| 8000000000:69:118:0045 | 0.899 | 0.894 | −0.6% |
| 8000000000:69:046:0007 | 0.4056 | 0.407 | +0.4% |
| 8000000000:90:146:0377 | 0.957 | 0.957 | +0.0% |
| 8000000000:66:259:0074 | 1.449 | 1.452 | +0.2% |
| 8000000000:79:483:0023 | 5.7092 | 5.705 | −0.1% |
| 8000000000:69:063:0028 | 0.208 | 0.208 | +0.1% |
| 8000000000:72:141:0120 | 1.3006 | 1.300 | −0.1% |
| 8000000000:79:366:0041 | 1.2966 | 1.295 | −0.1% |
| 8000000000:85:381:0010 | 0.2072 | 0.207 | −0.3% |

All within ±0.6%. This confirms the MVT decode, the tile-space → WGS84
transform, the cross-tile union by `cadnum`, and the UTM 36N area maths.

It specifically confirms the union step: decoding a single tile in isolation
gave 3.51 ha for a parcel declared at 5.36 ha (−34%), because the polygon was
clipped at the tile edge. Stitching the parts per `cadnum` removes that error.

Recomputing each overlap ratio from the source polygons reproduced the pipeline's
stored `overlap_ratio` exactly for all ten.

## 2. Case review

**Strong — development purpose on woodland**

- `8000000000:62:457:0006` (score 84) — 7.39 ha, 97% inside OSM `natural=wood`
  relation/8454749, Деснянський р-н, вул. Радистів 73. Registered
  *02.07 для іншої житлової забудови* (other housing development). Large,
  almost entirely inside mapped woodland, purpose is unambiguous.
- `8000000000:66:259:0074` (score 82) — 1.45 ha, 100% inside woodland,
  вул. Алма-Атинська 37-39. Registered *03.07 будівлі торгівлі* (retail).
- `8000000000:79:483:0023` (score 81) — 5.71 ha, 96% inside woodland between
  вул. Жулянською and Чабанівською, **communally owned**, registered
  *02.03 багатоквартирний житловий будинок* (apartment block).

These three are the pattern the tool is built to find: sizeable parcels, almost
wholly inside mapped forest, carrying an explicit build-it purpose.

**Needs caution — university campuses**

- `8000000000:69:046:0007` and `8000000000:69:063:0028` both fall inside the KPI
  campus (relation/1175542), registered for apartment blocks, one of them
  *"з об'єктами торгово-розважальної та ринкової інфраструктури"*
  (with retail and entertainment facilities).
- `8000000000:72:141:0120` — same pattern inside Державний університет
  телекомунікацій.

Flagged correctly by the rule, but **a student dormitory (гуртожиток) is
legitimately registered as 02.03 "багатоквартирний житловий будинок"**. On a
university campus that purpose code is expected, not anomalous. The
*торгово-розважальної* variant is more interesting, but none of these can be
called a finding without checking the building on the ground.

This is a known limitation, not a bug: OSM draws a university as one polygon
covering the whole campus, so every internal parcel reads as "inside a school".

## 3. What this run changed in the rules

Two false-positive classes were found by reading the first run's output and were
fixed in `src/rules.py`:

1. **`Не визначено` category counted as a contradiction.** It means the cadastre
   states no category — absence of evidence. It was flagging KPI's main parcel
   for having a blank field. Now a collision needs positive evidence.
2. **Defence land under military academies.** The industrial category string ends
   in *"…енергетики, **оборони** та іншого призначення"*, so the Військовий
   інститут телекомунікацій — the single highest-scoring hit of run 1 — was
   flagged for sitting on defence land, which is exactly where it belongs.
   Institutional classes are now condemned only by a development *purpose*.

Also: `Землі оздоровчого призначення` (health-resort land) was absent from the
40-tile sample used to build the category list and turned up under Сирецький Гай.
Added to the compatible-green set. `03.15 інша громадська забудова` was removed
from the hard-flag list as too generic.

Net effect: 5,229 → 4,404 flagged, with the top of the ranking now dominated by
explicit development purposes rather than blank fields.

## 4. Standing caveats

- OSM boundaries are crowd-sourced and may lag a lawful rezoning.
- z15 tile geometry is generalised; the 100 m² / 10% floor absorbs edge error but
  overlap areas remain approximate. That floor discarded 10,857 of 15,913
  intersecting pairs — without it, sliver overlaps along shared boundaries would
  be 68% of the output.
- Every hit is a data inconsistency to check against the source registry, not
  evidence of wrongdoing.
