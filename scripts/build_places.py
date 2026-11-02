#!/usr/bin/env python3
"""
Builds public/places/sabah.json: the places OTW searches on the phone and
draws on the map in Sabah.

Sources (all allow commercial use; the credit is shown on the map):
  - Overture Maps places: shops, food, suraus, offices... (Meta, Microsoft and others)
  - Overture streets, neighbourhoods, named land use, peaks, islands, beaches and
    named buildings (these come from OpenStreetMap)
  - OpenStreetMap places via Overpass, which fills some of Overture's gaps

GitHub Actions runs this once a month (.github/workflows/places.yml). By hand:
  pip install duckdb
  python scripts/build_places.py
"""
import datetime
import gzip
import json
import math
import os
import re
import sys
import time
import unicodedata
import urllib.parse
import urllib.request
from pathlib import Path

import duckdb

OUT = Path(__file__).resolve().parent.parent / "public" / "places" / "sabah.json"
BUCKET = "overturemaps-us-west-2"
# A box around Sabah, islands included; anything outside Sabah's border is dropped.
WEST, SOUTH, EAST, NORTH = 115.10, 3.95, 119.35, 7.45
# Overture's own 0-1 score. Below this, places are often closed, duplicated or junk.
MIN_CONFIDENCE = 0.3
# Sabah has several thousand named places in OpenStreetMap; far fewer means a broken download.
MIN_OSM = 3000
OVERPASS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.private.coffee/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
]
SURAU_NAME = re.compile(r"\b(surau|masjid|mosque)\b", re.I)
# Housing land use that reads well as an address ("Taman Indah Permai"), not "UMS staff quarters".
HOOD_NAME = re.compile(r"(taman|tmn|kampung|kampong|kg|desa|bandar|perumahan|pekan|bukit)\b", re.I)

# Chip groups in the app's search screen, checked in this order against the
# words of a category ("coffee_shop" is food, not a shop).
GROUPS = [
    ("surau", {"mosque", "muslim"}),
    ("fuel", {"gas", "fuel", "petrol"}),
    ("parking", {"parking"}),
    ("food", {"restaurant", "cafe", "coffee", "food", "bakery", "dessert", "juice", "bistro", "diner",
              "kopitiam", "hawker", "noodle", "noodles", "burger", "pizza", "eatery", "seafood", "bbq",
              "barbecue", "tea", "canteen", "mamak", "ice", "steakhouse", "court"}),
    ("shop", {"store", "shop", "market", "mall", "supermarket", "grocery", "pharmacy", "retail",
              "boutique", "hypermarket", "minimarket", "convenience"}),
]
LABELS = {
    "muslim_place_of_worship": "Surau / masjid", "mosque": "Surau / masjid", "gas_station": "Petrol station",
    "fuel": "Petrol station", "fast_food": "Fast food", "food_court": "Food court", "cafe": "Café",
    "peak": "Mountain", "volcano": "Mountain", "islet": "Island", "archipelago": "Islands", "cave_entrance": "Cave",
}
# Named nature from the map itself: peaks, islands, beaches. These are where the place really is.
NATURE = ("peak", "volcano", "hill", "ridge", "mountain_range", "valley", "cliff", "cave_entrance",
          "island", "islet", "archipelago", "beach", "reef")
REPEATED_AREA = re.compile(r"(taman|tmn|kampung|kampong|kg|kpg|desa|bandar|perumahan|jalan|lorong)\b")
GENERIC_BUILDING = {"store", "stor", "laboratory", "lab", "classes", "classroom", "hostel", "chapel", "dewan",
                    "canteen", "kantin", "surau", "jetty", "rectory", "toilet", "tandas", "garage", "office",
                    "warehouse", "gudang", "building", "block", "blok", "rumah", "house", "kedai", "shop", "hall"}
# One-of-a-kind places. Meta has copies of them wherever someone made a page or checked in
# ("Mount Kinabalu" in Putatan, "Tanjung Aru Beach" in Sepanggar), so far-away copies are dropped.
LANDMARK = {"beach", "mountain", "island", "national_park", "hiking_trail", "historic_site", "monument",
            "landmark_and_historical_building", "waterfall", "lake", "river", "tourist_attraction", "airport",
            "nature_reserve"}


def norm(text: str) -> str:
    """Same idea as the app's search: lower case, no accents or punctuation."""
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def label(raw: str) -> str:
    return LABELS.get(raw) or raw.replace("_", " ").strip().capitalize()


def category(raw: str, name: str) -> tuple[str, str]:
    """(label shown under the name, chip group) for a place."""
    if SURAU_NAME.search(name):
        return "Surau / masjid", "surau"
    words = set(re.split(r"[_\s]+", raw.lower()))
    for group, keys in GROUPS:
        if words & keys:
            return label(raw), group
    return (label(raw) if raw else "Place"), ""


def km(a, b) -> float:
    return math.hypot((a[0] - b[0]) * 111.32 * math.cos(math.radians(b[1])), (a[1] - b[1]) * 110.57)


class Grid:
    """Points bucketed by position, for 'nearest within N km' lookups."""

    def __init__(self, cell: float):
        self.cell, self.cells = cell, {}

    def key(self, x, y):
        return int(x // self.cell), int(y // self.cell)

    def add(self, x, y, value):
        self.cells.setdefault(self.key(x, y), []).append((x, y, value))

    def near(self, x, y):
        cx, cy = self.key(x, y)
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                yield from self.cells.get((cx + dx, cy + dy), ())

    def nearest(self, x, y, max_km):
        best, best_d = None, max_km
        for px, py, v in self.near(x, y):
            d = km((px, py), (x, y))
            if d <= best_d:
                best, best_d = v, d
        return best


def latest_release() -> str:
    url = f"https://{BUCKET}.s3.us-west-2.amazonaws.com/?list-type=2&prefix=release/&delimiter=/"
    with urllib.request.urlopen(url, timeout=60) as r:
        names = re.findall(r"<Prefix>release/([^<]+)/</Prefix>", r.read().decode())
    return max(names)


def overture(release: str):
    con = duckdb.connect()
    con.sql("INSTALL httpfs; LOAD httpfs; INSTALL spatial; LOAD spatial; "
            "SET s3_region='us-west-2'; SET enable_progress_bar=false;")
    base = f"s3://{BUCKET}/release/{release}"

    def src(theme):
        return f"read_parquet('{base}/theme={theme}/*', hive_partitioning=1)"

    box = f"bbox.xmin BETWEEN {WEST} AND {EAST} AND bbox.ymin BETWEEN {SOUTH} AND {NORTH}"
    con.sql(f"""CREATE TABLE sabah AS SELECT ST_Union_Agg(geometry) AS g FROM {src('divisions/type=division_area')}
                WHERE subtype = 'region' AND country = 'MY' AND names.primary = 'Sabah' AND {box}""")
    if con.sql("SELECT g IS NULL FROM sabah").fetchall()[0][0]:
        sys.exit("Couldn't find Sabah's border in Overture")
    inside = "ST_Intersects(geometry, (SELECT g FROM sabah))"

    places = con.sql(f"""
        SELECT names.primary, coalesce(taxonomy.primary, basic_category, ''), confidence,
               ST_X(geometry), ST_Y(geometry)
        FROM {src('places/type=place')}
        WHERE {box} AND names.primary IS NOT NULL AND confidence >= {MIN_CONFIDENCE}
          AND (operating_status IS NULL OR operating_status = 'open') AND {inside}""").fetchall()
    # A point in the middle of each named road piece (a corner of the line, so it's on the road).
    streets = con.sql(f"""
        SELECT names.primary, ST_X(p), ST_Y(p) FROM (
          SELECT names, ST_PointN(geometry, CAST((ST_NPoints(geometry) + 1) // 2 AS INTEGER)) AS p, geometry
          FROM {src('transportation/type=segment')}
          WHERE {box} AND subtype = 'road' AND names.primary IS NOT NULL
            AND class NOT IN ('footway', 'sidewalk', 'crosswalk', 'steps', 'cycleway', 'path', 'bridleway', 'pedestrian'))
        WHERE {inside}""").fetchall()
    divisions = con.sql(f"""
        SELECT names.primary, subtype, class, ST_X(geometry), ST_Y(geometry) FROM {src('divisions/type=division')}
        WHERE {box} AND names.primary IS NOT NULL
          AND subtype IN ('locality', 'localadmin', 'borough', 'macrohood', 'neighborhood', 'microhood') AND {inside}""").fetchall()
    land = con.sql(f"""
        SELECT names.primary, subtype, class, ST_X(c), ST_Y(c) FROM (
          SELECT names, subtype, class, ST_Centroid(geometry) AS c, geometry FROM {src('base/type=land_use')}
          WHERE {box} AND names.primary IS NOT NULL)
        WHERE {inside}""").fetchall()
    nature = con.sql(f"""
        SELECT names.primary, names.common['en'], class, ST_X(p), ST_Y(p) FROM (
          SELECT names, class, ST_PointOnSurface(geometry) AS p, geometry FROM {src('base/type=land')}
          WHERE {box} AND names.primary IS NOT NULL AND class IN {NATURE})
        WHERE {inside}""").fetchall()
    # Condos, churches, halls and school blocks that only have a name on the building.
    buildings = con.sql(f"""
        SELECT names.primary, coalesce(class, subtype, ''), ST_X(c), ST_Y(c) FROM (
          SELECT names, class, subtype, ST_Centroid(geometry) AS c, geometry FROM {src('buildings/type=building')}
          WHERE {box} AND names.primary IS NOT NULL)
        WHERE {inside}""").fetchall()
    # A rough outline (about 1 km accuracy) so the app knows where this file's places apply.
    border = json.loads(con.sql("SELECT ST_AsGeoJSON(ST_SimplifyPreserveTopology(g, 0.01)) FROM sabah").fetchall()[0][0])
    return places, streets, divisions, land, nature, buildings, border


def osm_places():
    """Named places from OpenStreetMap in Sabah (ISO 3166-2 code MY-12).

    Set OSM_CACHE=some/file.json to reuse one download while trying changes locally.
    """
    cache = Path(os.environ["OSM_CACHE"]) if os.environ.get("OSM_CACHE") else None
    if cache and cache.exists():
        return json.loads(cache.read_text(encoding="utf-8"))
    elements = download_osm()
    if cache:
        cache.write_text(json.dumps(elements), encoding="utf-8")
    return elements


def download_osm():
    q = """[out:json][timeout:300];
area["ISO3166-2"="MY-12"]->.s;
(nwr(area.s)["name"]["amenity"]; nwr(area.s)["name"]["shop"]; nwr(area.s)["name"]["tourism"];
 nwr(area.s)["name"]["leisure"]; nwr(area.s)["name"]["healthcare"]; nwr(area.s)["name"]["office"];);
out center tags;"""
    body = urllib.parse.urlencode({"data": q}).encode()
    for attempt in range(3):
        for url in OVERPASS:
            try:
                req = urllib.request.Request(url, data=body, headers={"User-Agent": "otw-app places build"})
                with urllib.request.urlopen(req, timeout=360) as r:
                    data = json.load(r)
                # A busy server can answer "OK" with a timeout note and no places at all.
                if len(data.get("elements", [])) < MIN_OSM:
                    raise ValueError(data.get("remark") or "too few places")
                return data["elements"]
            except Exception as e:  # busy server: try the next one
                print(f"  OpenStreetMap: {url.split('/')[2]} failed ({type(e).__name__}), trying another")
        time.sleep(30 * (attempt + 1))
    # Better no update this month than a file that silently lost OSM's places.
    sys.exit("OpenStreetMap download failed on every server; the old file is kept.")


def osm_category(tags: dict) -> str:
    if tags.get("amenity") == "place_of_worship" and tags.get("religion") == "muslim":
        return "mosque"
    for key in ("amenity", "shop", "tourism", "leisure", "healthcare", "office"):
        if key in tags:
            value = tags[key]
            if key == "shop" and value not in ("yes", "mall", "supermarket", "convenience"):
                return f"{value}_shop"
            return "shop" if value == "yes" else value
    return ""


def main():
    release = latest_release()
    print(f"Overture release {release}")
    t = time.time()
    ov_places, ov_streets, ov_divisions, ov_land, ov_nature, ov_buildings, border = overture(release)
    print(f"  Overture: {len(ov_places)} places, {len(ov_streets)} road pieces, {len(ov_divisions)} areas, "
          f"{len(ov_land)} named land use, {len(ov_nature)} peaks/islands/beaches, "
          f"{len(ov_buildings)} named buildings ({time.time() - t:.0f}s)")
    t = time.time()
    osm = osm_places()
    print(f"  OpenStreetMap: {len(osm)} places ({time.time() - t:.0f}s)")

    # --- Areas: tamans, kampungs, neighbourhoods and towns ---
    # Each place's subtitle is "<nearest taman or kampung>, <nearest town>", like Google's
    # "Taman Indah Permai, Menggatal". Towns are only real towns and cities, not hamlets.
    towns, hoods = Grid(0.3), Grid(0.02)
    area_rows = []  # (name, x, y, kind)
    # ALL-CAPS names are mostly mislabelled buildings ("SEKOLAH KEBANGSAAN ..."): searchable, not subtitles.
    good_subtitle = lambda name: not (name.isupper() and len(name) > 4)
    for name, subtype, cls, x, y in ov_divisions:
        if cls in ("city", "town"):
            towns.add(x, y, name)
            area_rows.append((name, x, y, "Town"))
            continue
        if good_subtitle(name):
            hoods.add(x, y, name)
        area_rows.append((name, x, y, "Village" if cls in ("village", "hamlet") else "Area"))
    other_land = []
    for name, subtype, cls, x, y in ov_land:
        if not re.search(r"[A-Z]", name) or len(name) < 4:
            continue  # "retention pond" and other generic labels
        if subtype == "residential":
            if good_subtitle(name) and HOOD_NAME.match(name):
                hoods.add(x, y, name)
            area_rows.append((name, x, y, "Housing area"))
        else:
            other_land.append((name, cls or subtype, x, y))
    # Where each peak, island and area really is, by name (English names too: "Mount Kinabalu").
    real_spot, area_spot = {}, {}
    for name, en, cls, x, y in ov_nature:
        area_rows.append((name, x, y, label(cls)))
        for n in {norm(name), norm(en or "")} - {""}:
            real_spot.setdefault(n, []).append((x, y))
    for name, x, y, kind in area_rows:
        # Every town has its own "Taman Sutera" and "Kampung Pantai", so those names aren't one place.
        if len(norm(name).split()) >= 2 and not REPEATED_AREA.match(norm(name)):
            # Towns and islands spread further than a taman: KKIA is 6 km from Kota Kinabalu's
            # centre, and Pulau Banggi is 30 km long.
            big = kind in ("Town", "Island", "Islands")
            area_spot.setdefault(norm(name), []).append((x, y, 25 if big else 5))

    def far_copy(name, raw, x, y):
        """A copy of a one-of-a-kind place that sits far from where that place really is."""
        n = norm(name)
        if n in real_spot:
            return all(km(p, (x, y)) > 3 for p in real_spot[n])
        if raw not in LANDMARK:
            return False
        # "Tanjung Aru Beach" belongs near Tanjung Aru.
        w = n.split()
        for size in (4, 3, 2):
            for i in range(len(w) - size + 1):
                spots = area_spot.get(" ".join(w[i:i + size]))
                if spots:
                    return all(km((px, py), (x, y)) > r for px, py, r in spots)
        return False

    def subtitle_for(x, y, own=None):
        parts = []
        for found in (hoods.nearest(x, y, 0.8), towns.nearest(x, y, 30)):
            if found and found != own and found not in parts:
                parts.append(found)
        return ", ".join(parts)

    # --- Places: OSM first (better categories), then Overture where OSM doesn't have it ---
    pois = []  # (name, label, group, x, y, score)
    osm_grid = Grid(0.01)
    for el in osm:
        tags = el.get("tags", {})
        x, y = (el["lon"], el["lat"]) if "lon" in el else (el["center"]["lon"], el["center"]["lat"])
        name = tags["name"].strip()
        lab, group = category(osm_category(tags), name)
        pois.append((name, lab, group, x, y, 0.8))
        osm_grid.add(x, y, norm(name))
    dup_grid, skipped, misplaced = Grid(0.002), 0, 0
    for name, raw, conf, x, y in sorted(ov_places, key=lambda r: -r[2]):
        name = name.strip()
        n = norm(name)
        same = lambda grid, r: any(v == n and km((px, py), (x, y)) < r for px, py, v in grid.near(x, y))
        # OSM and Overture often put the same masjid or KFC a couple of hundred metres apart.
        if same(osm_grid, 0.3) or same(dup_grid, 0.1):
            skipped += 1
            continue
        if far_copy(name, raw, x, y):
            misplaced += 1
            continue
        dup_grid.add(x, y, n)
        lab, group = category(raw, name)
        pois.append((name, lab, group, x, y, conf))
    for name, raw, x, y in ov_buildings:
        name = name.strip()
        n = norm(name)
        # "Store", "Dewan", "#67": labels on a campus map, not something to search for.
        if n in GENERIC_BUILDING or not re.search(r"[a-z]{2}", n):
            continue
        if len(n) < 3 or any(v == n and km((px, py), (x, y)) < 0.3
                             for grid in (osm_grid, dup_grid) for px, py, v in grid.near(x, y)):
            continue
        lab, group = category(raw, name)
        pois.append((name, lab if raw else "Building", group, x, y, 0.5))
    for name, cls, x, y in other_land:
        if not any(v == norm(name) for _, _, v in osm_grid.near(x, y)):
            lab, group = category(cls, name)
            pois.append((name, lab, group, x, y, 0.5))
    pois.sort(key=lambda p: -p[5])
    print(f"  Dropped {skipped} Overture places already in OpenStreetMap or listed twice, "
          f"{misplaced} far-away copies of landmarks")

    # --- Streets: one entry per street name per ~1.3 km, so long roads can be found from anywhere ---
    seen, streets = set(), []
    for name, x, y in ov_streets:
        k = (norm(name), round(x / 0.012), round(y / 0.012))
        if k not in seen:
            seen.add(k)
            streets.append((name, x, y))
    seen_areas, areas = Grid(0.02), []
    for name, x, y, kind in area_rows:
        n = norm(name)
        if any(v == n and km((px, py), (x, y)) < 1 for px, py, v in seen_areas.near(x, y)):
            continue
        seen_areas.add(x, y, n)
        areas.append((name, x, y, kind))

    # --- Write it compactly: [name, category index, lon×1e5, lat×1e5, subtitle index] ---
    cats, cat_index, subs, sub_index, rows = [], {}, [], {}, []

    def idx(table, index, value):
        if value not in index:
            index[value] = len(table)
            table.append(value)
        return index[value]

    def add(name, lab, group, x, y, sub):
        rows.append([name, idx(cats, cat_index, (lab, group)), round(x * 1e5), round(y * 1e5),
                     idx(subs, sub_index, sub) if sub else -1])

    for name, lab, group, x, y, _ in pois:
        add(name, lab, group, x, y, subtitle_for(x, y))
    for name, x, y, kind in areas:
        add(name, kind, "area", x, y, subtitle_for(x, y, own=name))
    for name, x, y in streets:
        add(name, "Street", "street", x, y, subtitle_for(x, y))

    data = {
        "region": "Sabah",
        "release": release,
        "built": datetime.date.today().isoformat(),
        "bbox": [WEST, SOUTH, EAST, NORTH],
        "border": border,
        "credit": "Places © Overture Maps Foundation, © OpenStreetMap contributors",
        "licence": "OpenStreetMap data: ODbL 1.0. Overture places: CDLA-Permissive-2.0, Apache-2.0, CC0-1.0.",
        "cats": [list(c) for c in cats],
        "subtitles": subs,
        "places": rows,
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
    OUT.write_text(text, encoding="utf-8")
    groups = {}
    for name, lab, group, *_ in pois:
        groups[group or "other"] = groups.get(group or "other", 0) + 1
    print(f"Wrote {OUT.name}: {len(pois)} places {groups}, {len(areas)} areas, {len(streets)} streets")
    print(f"  {len(text.encode()) / 1e6:.1f} MB, {len(gzip.compress(text.encode())) / 1e6:.1f} MB compressed")


if __name__ == "__main__":
    main()
