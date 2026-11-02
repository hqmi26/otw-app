-- OTW accounts and groups: Cloudflare D1 database "otw-family", bound to the Pages project as FAMILY_DB.
--
-- Every driver gets a row in users: a hidden ID with no name, email or phone number.
-- Someone who only drives alone has nothing else here, and trips are never recorded.
-- A name, area and trip only arrive once someone is in a group, and no history is kept:
-- each person's status row is overwritten, and the trip and live-car fields are cleared on arrival.
--
-- The older tables "families" and "members" are no longer used and can be dropped.
--
-- Times are unix seconds (UTC).

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                 -- the hidden ID
  name TEXT,                           -- the name groups see; empty unless you're in a group
  email TEXT UNIQUE,                   -- empty until someone links an email
  google_id TEXT UNIQUE,               -- empty until someone links Google
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS devices (
  token_hash TEXT PRIMARY KEY,         -- SHA-256 of the secret kept on the phone (no password)
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS groups (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,                  -- family: area and ETA always on; normal: hidden until a trip is shared
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL,              -- can remove people; passes to the longest-joined person
  invite_code TEXT NOT NULL UNIQUE,    -- the code in otw-app-eoz.pages.dev/join/<code>; a new link replaces it
  invite_expires_at INTEGER NOT NULL,  -- invite links work for 7 days
  created_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS group_members (
  group_id TEXT NOT NULL REFERENCES groups(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  joined_at INTEGER NOT NULL,
  sharing INTEGER NOT NULL DEFAULT 0,  -- normal groups: 1 = this person shared the current trip here
  PRIMARY KEY (group_id, user_id)
);

-- One row for someone in a group, gone once they've left their last one.
CREATE TABLE IF NOT EXISTS user_status (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  seen_at INTEGER,                     -- last time the phone checked in
  private INTEGER NOT NULL DEFAULT 0,  -- 1 = hidden from every group: the fields below stay empty

  -- Area only (e.g. Likas), with no exact spot, and only for family groups.
  -- area_lat/area_lng is a rough point (about 1 km), not where the person is.
  area TEXT,
  area_lat REAL,
  area_lng REAL,
  area_since INTEGER,

  -- The trip in progress: always shown to a family group, and to a normal group only if shared with it.
  trip_to TEXT,
  trip_eta INTEGER,

  -- The moving car, only while "Share live trip" is on.
  live_lat REAL,
  live_lng REAL,
  live_heading REAL,
  live_at INTEGER
);

CREATE INDEX IF NOT EXISTS devices_by_user ON devices (user_id);
CREATE INDEX IF NOT EXISTS group_members_by_user ON group_members (user_id);
