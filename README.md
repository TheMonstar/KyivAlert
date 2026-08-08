# Земельні розбіжності Києва

**Kyiv land-use discrepancies — public places vs. the land cadastre.**

An interactive map of **4,404 land parcels in Kyiv whose registered legal purpose
contradicts the park, forest, playground or school that OpenStreetMap maps on the
same ground** — an apartment block registered inside woodland, retail inside a
park, offices on a kindergarten's plot.

> These are **data inconsistencies requiring review, not evidence of wrongdoing.**
> The map shows a disagreement between two records. That is a starting point for
> enquiry, not a conclusion.

## The map

A single self-contained page — open `index.html`, or visit the published site.
Map code, fonts and data are all inlined; the only optional external request is
the street basemap, which is off until you switch it on.

- Filter by score, public-place type, **registered purpose**, ownership,
  district, or free text
- Switch the background between a plain ground and the **OpenStreetMap street
  map**, to see what actually stands on a parcel
- Click any parcel for its full registry record and score breakdown
- Every parcel links out to both the cadastral map and the OSM object, so any
  claim on the map can be checked at source

### Purpose groups

58 distinct purpose codes occur among the flagged parcels, so they are bucketed
into nine groups cut by what the designation *means*, not by the registry's own
section numbering:

| group | parcels | |
|---|--:|---|
| Housing | 1,295 | `02.01` `02.02` `02.03` `02.04` `02.07` `02.10` |
| Public common-use land | 923 | `12.13` `02.12` `18.00` `03.20` `11.07` `01.18` `16.00` |
| Transport & utilities | 658 | `12.*` `13.*` |
| Purpose not stated | 526 | blank, `Код не виокремлено` |
| Commerce & offices | 423 | `03.07`–`03.10` `03.17` `12.11` |
| Public services | 294 | `03.01`–`03.06` `03.11`–`03.16` `08.02` `10.08` |
| Industry | 181 | `11.*` |
| Agriculture & gardens | 66 | `01.*` |
| Garages & parking | 38 | `02.05` `02.06` `02.09` |

**"Public common-use land" is the group to watch.** Streets, squares,
intra-block passages and general-use green plantings are public land by
definition; those 923 parcels are flagged on their *category*, never their
purpose, and are the weakest hits in the set. Switch the group off to see only
the parcels carrying an actual development designation.

The background switch is off by default. Street tiles come from
`tile.openstreetmap.org` at view time — the only runtime network request the
page can make, and only when you ask for it. If they are blocked, the plain
ground stays visible underneath and the map tells you the tiles did not load.

## Method

Parcel boundaries and registry attributes come from the State Land Cadastre via
kadastrova-karta.com vector tiles, read across 3,025 tiles covering Kyiv. Public
places come from OpenStreetMap: 12,016 polygons in nine classes (park,
playground, recreation, sport, forest, water, education, health, cemetery),
clipped to the city boundary.

Of 394,752 parcels mapped across the Kyiv area, privately-owned ones are set
aside as the expected background; 45,917 in communal, state or unstated
ownership fall inside the city boundary and are examined.

A parcel is flagged only on **positive evidence** of a contradiction — either a
development purpose registered on it (housing, retail, offices), or a
development land category on open green space. A blank registry field is missing
data, not a contradiction, and never flags.

Overlaps are computed in UTM zone 36N and must exceed both 100 m² and 10% of the
parcel; below that the two datasets' independent digitising produces slivers
along every shared edge, which would otherwise be about two thirds of the output.

Parcel geometry reconstructed from the tiles agrees with the cadastre's own
declared areas to **within ±0.6%**, which validates the whole decoding path.

## Known limits

- OSM draws a university or hospital as **one polygon over the whole campus**, so
  parcels inside it all read as "inside a school" — and a student dormitory is
  lawfully registered as an apartment building. Treat the education and health
  hits as needing building-level checking. The forest and park hits do not have
  this problem.
- An OSM park tag may predate a lawful rezoning.
- Cadastral geometry is generalised in vector tiles, so overlap areas are
  approximate.
- OSM is crowd-sourced; boundaries carry no legal weight.

## The data

The derived datasets behind the map are published alongside it, so results can be
checked and reused without rerunning anything:

| file | contents |
|---|---|
| `data/collisions.geojson` | the 4,404 flagged parcels, scored, each with its full registry record and every public place it overlaps |
| `data/public_places.geojson` | the 12,016 OSM public-place polygons, classified and clipped to the city |
| `data/kyiv_boundary.geojson` | the city boundary used for clipping (OSM relation 421866) |
| `data/purpose_codes.tsv` | every one of the 128 purpose codes present in the cadastre data, with counts and sample text |

The 380 MB full-city parcel baseline and the 832 MB OpenStreetMap extract are not
committed — they are bulk inputs, regenerable from the sources named below.

Note that the purpose-code section numbering in these tiles does **not** match the
published KVCPZ ordering (`11.02` is manufacturing, `12.04` is road transport), so
codes were read from the data rather than assumed. `purpose_codes.tsv` is the
reference for what each code actually means here.

## Data & attribution

- Public places and the city boundary: **© OpenStreetMap contributors**, licensed
  under the [Open Database License (ODbL)](https://www.openstreetmap.org/copyright).
- Parcel boundaries and registry attributes: State Land Cadastre of Ukraine, via
  [kadastrova-karta.com](https://kadastrova-karta.com).
- Map rendering: [MapLibre GL JS](https://maplibre.org) (3-Clause BSD).
- Typeface: [IBM Plex](https://github.com/IBM/plex) (SIL Open Font License 1.1).

Derived data shown here is a produced work from an ODbL database; reuse should
carry the same attribution.

## Corrections

If a parcel is shown wrongly — a rezoning the map missed, an OSM boundary that is
out of date, a misread record — please open an issue with the cadastral number.
Corrections are welcome and expected.
