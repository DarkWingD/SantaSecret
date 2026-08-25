'use strict';
// SQLite connection + schema. Single-file DB (better-sqlite3, synchronous).
const Database = require('better-sqlite3');
const { dbPath } = require('./config');

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS organizers (
  id            INTEGER PRIMARY KEY,
  email         TEXT UNIQUE NOT NULL,
  display_name  TEXT,
  status        TEXT NOT NULL DEFAULT 'pending',   -- pending | approved | rejected | revoked
  created_at    TEXT NOT NULL,
  approved_at   TEXT
);

CREATE TABLE IF NOT EXISTS events (
  id                INTEGER PRIMARY KEY,
  organizer_id      INTEGER NOT NULL REFERENCES organizers(id) ON DELETE CASCADE,
  name              TEXT NOT NULL,
  details           TEXT,
  location          TEXT,
  exchange_date     TEXT,                        -- "YYYY-MM-DD"
  budget            TEXT,                        -- free text, e.g. "$30"
  wishlist_deadline TEXT,                        -- "YYYY-MM-DD"
  status            TEXT NOT NULL DEFAULT 'setup',  -- setup | drawn | closed
  drawn_at          TEXT,
  created_at        TEXT NOT NULL,
  updated_at        TEXT,
  purge_after       TEXT NOT NULL                -- date "YYYY-MM-DD"
);

CREATE TABLE IF NOT EXISTS members (
  id                    INTEGER PRIMARY KEY,
  event_id              INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  name                  TEXT NOT NULL,
  email                 TEXT NOT NULL,
  token                 TEXT UNIQUE NOT NULL,
  assigned_to_member_id INTEGER,                 -- whom this member BUYS FOR (set on draw)
  opened_at             TEXT,
  revealed_at           TEXT,
  notified_at           TEXT,
  created_at            TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS wishlist_items (
  id          INTEGER PRIMARY KEY,
  member_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  link        TEXT,
  note        TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS exclusions (
  id            INTEGER PRIMARY KEY,
  event_id      INTEGER NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  member_a_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  member_b_id   INTEGER NOT NULL REFERENCES members(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings ( key TEXT PRIMARY KEY, value TEXT );

CREATE INDEX IF NOT EXISTS idx_events_org      ON events(organizer_id);
CREATE INDEX IF NOT EXISTS idx_members_event   ON members(event_id);
CREATE INDEX IF NOT EXISTS idx_wishlist_member ON wishlist_items(member_id);
CREATE INDEX IF NOT EXISTS idx_excl_event      ON exclusions(event_id);
`);

// --- settings helpers ---
const _getSetting = db.prepare('SELECT value FROM app_settings WHERE key = ?');
const _setSetting = db.prepare(
  'INSERT INTO app_settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
);
function getSetting(key, fallback = null) { const r = _getSetting.get(key); return r ? r.value : fallback; }
function setSetting(key, value) { _setSetting.run(key, String(value)); }
function signupsPaused() { return getSetting('signups_paused', '0') === '1'; }

// --- email quota block (monthly, reacts to Resend's cap error) ---
function currentMonth() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}
function emailBlocked() { return getSetting('email_blocked_month', '') === currentMonth(); }
function blockEmailThisMonth() { setSetting('email_blocked_month', currentMonth()); }
function clearEmailBlock() { setSetting('email_blocked_month', ''); }

module.exports = {
  db, getSetting, setSetting, signupsPaused,
  emailBlocked, blockEmailThisMonth, clearEmailBlock, currentMonth,
};
