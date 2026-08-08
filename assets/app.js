/* Земельні розбіжності Києва — public places vs. the land cadastre.
 *
 * The datasets are fetched at load rather than inlined, so the page stays
 * readable and the browser can cache each file separately. That means this
 * page must be served over http:// — see the note in index.html.
 */

const DATA_FILES = {
  collisions: "data/collisions.geojson",
  places: "data/public_places.geojson",
  boundary: "data/kyiv_boundary.geojson",
};

let DATA = null;
let ALL = [];
let OWNERS = [];

// How the contradiction shows up in the registry. A registered development
// purpose is much harder to explain away than a broad land category.
const KIND_LABEL = {
  purpose: "Development purpose registered here",
  category: "Development land category",
};

// Must track PURPOSE_GROUPS in src/rules.py.
const PURPOSE_LABEL = {
  housing: "Housing",
  common_use: "Public common-use land",
  transport: "Transport & utilities",
  unspecified: "Purpose not stated",
  commerce: "Commerce & offices",
  public_svc: "Public services",
  industry: "Industry",
  agriculture: "Agriculture & gardens",
  garages: "Garages & parking",
};

const CLASS_LABEL = {
  park: "Park / garden", playground: "Playground", recreation: "Recreation ground",
  sport: "Sports ground", forest: "Forest / reserve", water: "Water / wetland",
  education: "School / kindergarten", health: "Hospital / clinic", cemetery: "Cemetery",
};

const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

const fmtInt = (n) => new Intl.NumberFormat("uk-UA").format(Math.round(n));
const fmtArea = (m2) => m2 >= 10000 ? (m2 / 10000).toFixed(m2 >= 100000 ? 0 : 1) + " ha"
                                    : Math.round(m2) + " m²";

// District comes out of the cadastral address, e.g. "м.Київ, р-н Солом'янський, …".
function district(address) {
  const m = (address || "").match(/р-н\s+([^,]+)/);
  return m ? m[1].trim() : "";
}

// Build the row index, and stamp each feature with its position so the map can
// filter on a cheap integer rather than a cadastral-number string. This was
// done at build time when the data was inlined; now it happens on load.
function indexData() {
  DATA.collisions.features.forEach((f, i) => {
    f.id = i;
    f.properties._i = i;
  });

  ALL = DATA.collisions.features.map((f, i) => {
    const p = f.properties;
    return { i, p, district: district(p.address),
             haystack: [p.cadnum, p.address, p.osm_name, p.purpose].join(" ").toLowerCase() };
  });

  state.owners = new Set();
  for (const r of ALL) state.owners.add(r.p.ownership || "Не визначено");
  OWNERS = [...state.owners].sort();
}

const state = {
  minScore: 0,
  classes: new Set(Object.keys(CLASS_LABEL)),
  purposes: new Set(Object.keys(PURPOSE_LABEL)),
  owners: new Set(),
  district: "",
  query: "",
  selected: null,
};

function visible() {
  const q = state.query;
  return ALL.filter((r) =>
    r.p.score >= state.minScore &&
    state.classes.has(r.p.osm_class) &&
    state.purposes.has(r.p.purpose_group || "unspecified") &&
    state.owners.has(r.p.ownership || "Не визначено") &&
    (!state.district || r.district === state.district) &&
    (!q || r.haystack.includes(q))
  );
}

/* ---------------- map ---------------- */

const bounds = [[30.20, 50.19], [30.87, 50.61]];
const map = new maplibregl.Map({
  container: "map",
  style: { version: 8, sources: {}, layers: [] },
  bounds, fitBoundsOptions: { padding: 24 },
  attributionControl: false,
  dragRotate: false,
});
map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
map.addControl(new maplibregl.ScaleControl({ maxWidth: 110, unit: "metric" }), "bottom-right");

// Score -> severity ramp. Read from tokens so both themes stay in sync.
const rampExpr = () => [
  "interpolate", ["linear"], ["get", "score"],
  30, css("--sev-low"), 65, css("--sev-mid"), 100, css("--sev-high"),
];

// Street tiles are drawn for a light background. In dark mode they are muted
// and darkened so the score ramp stays the brightest thing on the map.
function paintBasemap() {
  const dark = matchMedia("(prefers-color-scheme: dark)").matches
    ? document.documentElement.getAttribute("data-theme") !== "light"
    : document.documentElement.getAttribute("data-theme") === "dark";
  map.setPaintProperty("osm-tiles", "raster-opacity", dark ? 0.55 : 0.85);
  map.setPaintProperty("osm-tiles", "raster-saturation", dark ? -0.7 : -0.35);
  map.setPaintProperty("osm-tiles", "raster-brightness-max", dark ? 0.55 : 1);
  map.setPaintProperty("osm-tiles", "raster-contrast", dark ? -0.15 : 0);
}

function setBasemap(mode) {
  const on = mode === "osm";
  map.setLayoutProperty("osm-tiles", "visibility", on ? "visible" : "none");
  // Public places would obscure the streets underneath; drop them back when
  // the basemap carries the context instead.
  map.setPaintProperty("places-fill", "fill-opacity", on ? 0.10 : 0.20);
  map.setPaintProperty("places-line", "line-opacity", on ? 0.75 : 0.55);
  if (on) paintBasemap();
  for (const b of document.querySelectorAll("#basemap-switch button")) {
    b.setAttribute("aria-pressed", String(b.dataset.basemap === mode));
  }
}

function paintTheme() {
  map.setPaintProperty("bg", "background-color", css("--map-ground"));
  paintBasemap();
  map.setPaintProperty("boundary", "line-color", css("--map-boundary"));
  map.setPaintProperty("places-fill", "fill-color", css("--place"));
  map.setPaintProperty("places-line", "line-color", css("--place"));
  for (const layer of ["parcels-fill", "parcels-line"]) {
    map.setPaintProperty(layer, layer.endsWith("fill") ? "fill-color" : "line-color", rampExpr());
  }
}

function addLayers() {
  map.addSource("boundary", { type: "geojson", data: DATA.boundary });
  map.addSource("places", { type: "geojson", data: DATA.places });
  // Features carry their own integer id (stamped in indexData), which is what
  // feature-state selection keys off.
  map.addSource("parcels", { type: "geojson", data: DATA.collisions });

  map.addLayer({ id: "bg", type: "background", paint: { "background-color": css("--map-ground") } });

  // Optional street basemap. Kept above the flat background rather than
  // replacing it, so that if the tiles never arrive -- a strict CSP, an offline
  // viewer, a blocked host -- the map still reads correctly instead of going
  // blank. Hidden until asked for; see setBasemap().
  map.addSource("osm", {
    type: "raster",
    tiles: ["https://tile.openstreetmap.org/{z}/{x}/{y}.png"],
    tileSize: 256,
    maxzoom: 19,
    attribution: "© OpenStreetMap contributors",
  });
  map.addLayer({
    id: "osm-tiles", type: "raster", source: "osm",
    layout: { visibility: "none" },
    paint: { "raster-opacity": 1 },
  });

  map.addLayer({ id: "places-fill", type: "fill", source: "places",
    paint: { "fill-color": css("--place"), "fill-opacity": 0.20 } });
  map.addLayer({ id: "places-line", type: "line", source: "places",
    paint: { "line-color": css("--place"), "line-width": 0.8, "line-opacity": 0.55 } });

  map.addLayer({ id: "boundary", type: "line", source: "boundary",
    paint: { "line-color": css("--map-boundary"), "line-width": 1.2, "line-dasharray": [3, 2] } });

  map.addLayer({ id: "parcels-fill", type: "fill", source: "parcels",
    paint: { "fill-color": rampExpr(), "fill-opacity": ["case", ["boolean", ["feature-state", "sel"], false], 0.92, 0.62] } });
  map.addLayer({ id: "parcels-line", type: "line", source: "parcels",
    paint: { "line-color": rampExpr(),
             "line-width": ["case", ["boolean", ["feature-state", "sel"], false], 2.4, 0.6] } });

  map.on("click", "parcels-fill", (e) => {
    const cad = e.features[0].properties.cadnum;
    const row = ALL.find((r) => r.p.cadnum === cad);
    if (row) select(row, true);
  });
  map.on("mouseenter", "parcels-fill", () => map.getCanvas().style.cursor = "pointer");
  map.on("mouseleave", "parcels-fill", () => map.getCanvas().style.cursor = "");

  for (const b of document.querySelectorAll("#basemap-switch button")) {
    b.addEventListener("click", () => setBasemap(b.dataset.basemap));
  }
  // Report a blocked or failed tile source rather than leaving the user
  // wondering why "OSM map" did nothing.
  map.on("error", (e) => {
    if (e && e.sourceId === "osm") el("basemap-note").classList.add("show");
  });
}

const themeQuery = window.matchMedia("(prefers-color-scheme: dark)");
themeQuery.addEventListener("change", () => { if (map.isStyleLoaded()) paintTheme(); });
new MutationObserver(() => { if (map.isStyleLoaded()) paintTheme(); })
  .observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

function applyFilter(rows) {
  const expr = ["in", ["get", "_i"], ["literal", rows.map((r) => r.i)]];
  if (map.getLayer("parcels-fill")) {
    map.setFilter("parcels-fill", expr);
    map.setFilter("parcels-line", expr);
  }
}

let selectedIndex = null;
function setMapSelection(index) {
  if (selectedIndex !== null) map.setFeatureState({ source: "parcels", id: selectedIndex }, { sel: false });
  selectedIndex = index;
  if (index !== null) map.setFeatureState({ source: "parcels", id: index }, { sel: true });
}

/* ---------------- rail ---------------- */

const el = (id) => document.getElementById(id);

function chip(container, key, text, count, active, onToggle) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = "chip";
  b.setAttribute("aria-pressed", String(active));
  b.innerHTML = `<span class="dot"></span>${text} <span class="n">${count}</span>`;
  b.addEventListener("click", () => {
    const now = b.getAttribute("aria-pressed") !== "true";
    b.setAttribute("aria-pressed", String(now));
    onToggle(now);
    render();
  });
  container.appendChild(b);
}

function buildControls() {
  const classCounts = {}, ownerCounts = {};
  for (const r of ALL) {
    classCounts[r.p.osm_class] = (classCounts[r.p.osm_class] || 0) + 1;
    const o = r.p.ownership || "Не визначено";
    ownerCounts[o] = (ownerCounts[o] || 0) + 1;
  }

  const chipBox = el("class-chips");
  Object.keys(CLASS_LABEL)
    .filter((c) => classCounts[c])
    .sort((a, b) => classCounts[b] - classCounts[a])
    .forEach((c) => chip(chipBox, c, CLASS_LABEL[c], classCounts[c], true, (on) => {
      on ? state.classes.add(c) : state.classes.delete(c);
    }));

  const purposeCounts = {};
  for (const r of ALL) {
    const g = r.p.purpose_group || "unspecified";
    purposeCounts[g] = (purposeCounts[g] || 0) + 1;
  }
  const purposeBox = el("purpose-chips");
  Object.keys(PURPOSE_LABEL)
    .filter((g) => purposeCounts[g])
    .sort((a, b) => purposeCounts[b] - purposeCounts[a])
    .forEach((g) => chip(purposeBox, g, PURPOSE_LABEL[g], purposeCounts[g], true, (on) => {
      on ? state.purposes.add(g) : state.purposes.delete(g);
    }));

  el("purpose-all").addEventListener("click", () => {
    state.purposes = new Set(Object.keys(PURPOSE_LABEL));
    for (const b of purposeBox.querySelectorAll(".chip")) b.setAttribute("aria-pressed", "true");
    render();
  });

  const ownerBox = el("owner-chips");
  OWNERS.forEach((o) => chip(ownerBox, o, o, ownerCounts[o] || 0, true, (on) => {
    on ? state.owners.add(o) : state.owners.delete(o);
  }));

  const districts = [...new Set(ALL.map((r) => r.district).filter(Boolean))].sort();
  const sel = el("district");
  for (const d of districts) {
    const opt = document.createElement("option");
    opt.value = d; opt.textContent = d;
    sel.appendChild(opt);
  }
  sel.addEventListener("change", () => { state.district = sel.value; render(); });

  el("min-score").addEventListener("input", (e) => {
    state.minScore = +e.target.value;
    el("min-score-out").textContent = e.target.value;
    render();
  });

  let timer;
  el("search").addEventListener("input", (e) => {
    clearTimeout(timer);
    timer = setTimeout(() => { state.query = e.target.value.trim().toLowerCase(); render(); }, 140);
  });

  el("detail-back").addEventListener("click", closeDetail);
}

function sevColor(score) {
  return score >= 65 ? css("--sev-high") : score >= 45 ? css("--sev-mid") : css("--sev-low");
}

function render() {
  const rows = visible();

  el("stat-count").textContent = fmtInt(rows.length);
  const totalM2 = rows.reduce((s, r) => s + (r.p.overlap_m2 || 0), 0);
  el("stat-area").textContent = totalM2 >= 10000 ? (totalM2 / 10000).toFixed(0) + " ha" : Math.round(totalM2) + " m²";
  const scores = rows.map((r) => r.p.score).sort((a, b) => a - b);
  el("stat-score").textContent = scores.length ? scores[Math.floor(scores.length / 2)] : "—";
  el("list-count").textContent = rows.length ? `${Math.min(rows.length, 300)} of ${fmtInt(rows.length)}` : "";

  const list = el("list");
  list.replaceChildren();

  if (!rows.length) {
    const p = document.createElement("p");
    p.className = "empty";
    p.textContent = "No parcels match these filters. Try lowering the minimum score.";
    list.appendChild(p);
  }

  // Cap the DOM at 300 rows; the map still shows every match.
  const frag = document.createDocumentFragment();
  for (const r of rows.slice(0, 300)) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "row";
    b.setAttribute("role", "listitem");
    if (state.selected === r) b.setAttribute("aria-current", "true");
    b.innerHTML =
      `<span class="stripe" style="background:${sevColor(r.p.score)}"></span>` +
      `<span class="score" style="color:${sevColor(r.p.score)}">${r.p.score}</span>` +
      `<span class="body">` +
        `<span class="name">${esc(r.p.osm_name || CLASS_LABEL[r.p.osm_class] || "—")}</span>` +
        `<span class="meta">${CLASS_LABEL[r.p.osm_class]} · ${Math.round(r.p.overlap_ratio * 100)}% overlap · ${fmtArea(r.p.overlap_m2)}</span>` +
        `<span class="meta"><b style="color:${r.p.kind === "purpose" ? sevColor(70) : "inherit"}">${KIND_LABEL[r.p.kind] || ""}</b></span>` +
        `<span class="meta cad">${esc(r.p.cadnum)}</span>` +
      `</span>`;
    b.addEventListener("click", () => select(r, false));
    frag.appendChild(b);
  }
  list.appendChild(frag);

  if (map.isStyleLoaded()) applyFilter(rows);
}

function esc(s) {
  return String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
}

function select(row, fromMap) {
  state.selected = row;
  setMapSelection(row.i);
  openDetail(row);
  if (!fromMap) {
    const g = DATA.collisions.features[row.i].geometry;
    const b = new maplibregl.LngLatBounds();
    const walk = (c) => Array.isArray(c[0]) ? c.forEach(walk) : b.extend(c);
    walk(g.coordinates);
    map.fitBounds(b, { padding: 140, maxZoom: 17, duration: 700 });
  }
  for (const node of document.querySelectorAll(".row")) node.removeAttribute("aria-current");
  render();
}

const BREAKDOWN_LABEL = {
  overlap_ratio: "Overlap share", overlap_area: "Overlap size", evidence: "Evidence strength",
  place_type: "Place type", ownership: "Ownership", disposal: "On sale / auction",
};
// Must track MAX_POINTS in src/rules.py.
const BREAKDOWN_MAX = {
  overlap_ratio: 35, overlap_area: 15, evidence: 15,
  place_type: 15, ownership: 10, disposal: 10,
};

function openDetail(row) {
  const p = row.p;
  el("detail-rank").textContent = `${CLASS_LABEL[p.osm_class] || p.osm_class}`;

  const bars = Object.entries(p.score_breakdown || {}).map(([k, v]) =>
    `<div class="bar"><span>${BREAKDOWN_LABEL[k] || k}</span>` +
    `<span class="track"><span class="fill" style="width:${(v / (BREAKDOWN_MAX[k] || 20)) * 100}%"></span></span>` +
    `<span class="v">${v}</span></div>`).join("");

  const others = (p.collisions || []).slice(1);
  const othersHtml = others.length
    ? `<div class="divider"></div><span class="label">Also overlaps</span>` +
      `<div class="bars" style="margin-top:8px">` + others.map((h) =>
        `<div style="font-size:12px;color:var(--ink-2)">${esc(h.osm_name || CLASS_LABEL[h.osm_class])} — ` +
        `${CLASS_LABEL[h.osm_class]}, ${Math.round(h.overlap_ratio * 100)}%, ${fmtArea(h.overlap_m2)}</div>`
      ).join("") + `</div>`
    : "";

  el("detail-scroll").innerHTML =
    `<div class="verdict">
       <span class="big" style="color:${sevColor(p.score)}">${p.score}</span>
       <span style="font-size:12.5px;line-height:1.4;color:var(--ink-2)">
         ${Math.round(p.overlap_ratio * 100)}% of this parcel sits inside<br>
         <b style="color:var(--ink)">${esc(p.osm_name || CLASS_LABEL[p.osm_class])}</b>
         (${fmtArea(p.overlap_m2)})
       </span>
     </div>
     <dl>
       <dt>Evidence</dt><dd>${KIND_LABEL[p.kind] || "—"}</dd>
       <dt>Cadnum</dt><dd class="mono">${esc(p.cadnum)}</dd>
       <dt>Purpose</dt><dd>${esc(p.purpose || "—")}<br>
         <span style="color:var(--ink-3);font-size:11.5px">${PURPOSE_LABEL[p.purpose_group] || ""}</span></dd>
       <dt>Category</dt><dd>${esc(p.category || "—")}</dd>
       <dt>Ownership</dt><dd>${esc(p.ownership || "—")}</dd>
       <dt>Area</dt><dd class="mono">${p.area_ha != null ? p.area_ha + " ha" : "—"}</dd>
       <dt>Address</dt><dd>${esc(p.address || "—")}</dd>
       ${p.auctions ? `<dt>Auction</dt><dd>${esc(p.auctions)}</dd>` : ""}
       ${p.land_sales ? `<dt>Sale</dt><dd>${esc(p.land_sales)}</dd>` : ""}
     </dl>
     <div class="divider"></div>
     <span class="label">Score breakdown</span>
     <div class="bars" style="margin-top:8px">${bars}</div>
     ${othersHtml}
     <div class="divider"></div>
     <div style="display:flex;flex-direction:column;gap:6px;font-size:12.5px">
       <a href="${esc(p.kadastr_url)}" target="_blank" rel="noopener">Open parcel in the cadastral map ↗</a>
       <a href="https://www.openstreetmap.org/${esc(p.osm_id)}" target="_blank" rel="noopener">Open the OSM object ↗</a>
     </div>`;

  el("detail").classList.add("open");
}

function closeDetail() {
  el("detail").classList.remove("open");
  state.selected = null;
  setMapSelection(null);
  render();
}

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && el("detail").classList.contains("open")) closeDetail();
});

/* ---------------- boot ---------------- */

// Figures quoted in the method note come from the run that produced the data,
// so they can never drift from what is actually on the map.
function fillStats() {
  const meta = DATA.collisions.properties || {};
  for (const node of document.querySelectorAll("[data-stat]")) {
    const value = meta[node.dataset.stat];
    node.textContent = value == null ? "—" : fmtInt(value);
  }
}

async function loadData() {
  const entries = await Promise.all(
    Object.entries(DATA_FILES).map(async ([key, url]) => {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`${url} — HTTP ${response.status}`);
      return [key, await response.json()];
    })
  );
  return Object.fromEntries(entries);
}

function failLoading(error) {
  const box = el("loading");
  box.classList.remove("slow");
  box.classList.add("failed");
  el("loading-msg").textContent = `Could not load the map data: ${error.message}`;
  console.error(error);
}

(async function boot() {
  // If the fetch is merely slow, surface the http:// hint rather than leaving
  // a blank panel; if it fails outright, failLoading() shows the real reason.
  const slowTimer = setTimeout(() => el("loading").classList.add("slow"), 2500);

  try {
    const mapReady = new Promise((resolve) => map.on("load", resolve));
    DATA = await loadData();
    clearTimeout(slowTimer);

    indexData();
    fillStats();
    buildControls();

    await mapReady;
    addLayers();
    render();

    el("loading").classList.add("done");
  } catch (error) {
    clearTimeout(slowTimer);
    failLoading(error);
  }
})();
