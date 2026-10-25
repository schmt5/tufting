-- Schema der eigenen Anmeldung, siehe plan.md §4.
--
-- Daten und Uhrzeiten sind Schweizer Ortszeit als ISO-Strings (date YYYY-MM-DD,
-- Zeiten HH:MM), Zeitstempel Unix-Sekunden in UTC.
--
-- Freie Plätze werden nirgends gespeichert, sondern aus den Anmeldungen
-- gezählt: capacity − SUM(persons) über die nicht stornierten. Eine
-- gespeicherte Zahl könnte auseinanderlaufen, eine gezählte nicht.

CREATE TABLE workshops (
  id          TEXT PRIMARY KEY,
  date        TEXT NOT NULL,
  start_time  TEXT NOT NULL,
  end_time    TEXT NOT NULL,
  capacity    INTEGER NOT NULL CHECK (capacity > 0),
  note        TEXT,
  status      TEXT NOT NULL DEFAULT 'draft'
              CHECK (status IN ('draft', 'published', 'cancelled')),
  created_at  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE INDEX workshops_date ON workshops (date, start_time);

CREATE TABLE signups (
  id            TEXT PRIMARY KEY,
  workshop_id   TEXT NOT NULL REFERENCES workshops (id) ON DELETE CASCADE,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  email         TEXT NOT NULL,
  persons       INTEGER NOT NULL CHECK (persons > 0),
  comment       TEXT,
  source        TEXT NOT NULL DEFAULT 'web' CHECK (source IN ('web', 'admin')),
  created_at    INTEGER NOT NULL,
  contacted_at  INTEGER,
  cancelled_at  INTEGER
);

CREATE INDEX signups_workshop ON signups (workshop_id);

CREATE TABLE templates (
  key         TEXT PRIMARY KEY,
  subject     TEXT NOT NULL,
  body        TEXT NOT NULL,
  updated_at  INTEGER NOT NULL
);

CREATE TABLE push_subscriptions (
  endpoint    TEXT PRIMARY KEY,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  label       TEXT,
  created_at  INTEGER NOT NULL
);

-- Nur für die Login-Sperre; der Cron leert die Tabelle nach einem Tag.
CREATE TABLE login_failures (
  ip  TEXT NOT NULL,
  at  INTEGER NOT NULL
);

CREATE INDEX login_failures_ip ON login_failures (ip, at);
