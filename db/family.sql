-- OTW family sharing: Cloudflare D1 database "otw-family", bound to the Pages project as FAMILY_DB.
--
-- One row per family and one row per person. No history is kept: each person's row is
-- overwritten with their latest area, and the trip and live-car fields are cleared on arrival.
-- The exact spot never comes here, except the live car while that person has
-- "Share live trip" switched on.
--
-- Times are unix seconds (UTC).

CREATE TABLE IF NOT EXISTS families (
  id TEXT PRIMARY KEY,
  invite_code TEXT NOT NULL UNIQUE,    -- the code in otw-app-eoz.pages.dev/join/<code>; a new link replaces it
  invite_expires_at INTEGER NOT NULL,  -- invite links work for 7 days
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS members (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- the name typed when joining
  token_hash TEXT NOT NULL UNIQUE,     -- SHA-256 of the secret kept on the phone (no password)
  joined_at INTEGER NOT NULL,
  seen_at INTEGER,                     -- last time the phone checked in
  private INTEGER NOT NULL DEFAULT 0,  -- 1 = hidden: the area, trip and live fields stay empty

  -- Area only, worked out on the phone (e.g. Likas).
  -- area_lat/area_lng is the middle of the area, not where the person is.
  area TEXT,
  area_lat REAL,
  area_lng REAL,
  area_since INTEGER,

  -- The trip in progress, always shared while driving.
  trip_to TEXT,
  trip_eta INTEGER,

  -- The moving car, only while "Share live trip" is on.
  live_lat REAL,
  live_lng REAL,
  live_heading REAL,
  live_at INTEGER
);

CREATE INDEX IF NOT EXISTS members_by_family ON members (family_id);
