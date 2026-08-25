'use strict';
// Data-access layer. All SQL lives here.
const { db } = require('./db');
const { adminEmail, purgeDays } = require('./config');
const { makeToken } = require('./token');

const now = () => new Date().toISOString();
const today = () => {
  const p = (n) => String(n).padStart(2, '0');
  const d = new Date();
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`;
};
function addDaysToDate(dateStr, days) {
  const [y, mo, d] = String(dateStr).split('-').map(Number);
  const dt = new Date(Date.UTC(y, mo - 1, d + days));
  const p = (n) => String(n).padStart(2, '0');
  return `${dt.getUTCFullYear()}-${p(dt.getUTCMonth() + 1)}-${p(dt.getUTCDate())}`;
}

// ─── Organizers (per-person approval, same as RSVP) ──────────
const _orgByEmail = db.prepare('SELECT * FROM organizers WHERE email = ?');
const _orgById = db.prepare('SELECT * FROM organizers WHERE id = ?');
function findOrganizerByEmail(email) { return _orgByEmail.get(String(email).toLowerCase()); }
function getOrganizer(id) { return _orgById.get(id); }

function ensureOrganizer(email, displayName = null) {
  email = String(email).toLowerCase();
  const existing = findOrganizerByEmail(email);
  if (existing) return existing;
  const status = email === adminEmail ? 'approved' : 'pending';
  const created = now();
  const info = db.prepare('INSERT INTO organizers(email, display_name, status, created_at, approved_at) VALUES(?, ?, ?, ?, ?)')
    .run(email, displayName, status, created, status === 'approved' ? created : null);
  return getOrganizer(info.lastInsertRowid);
}
function setOrganizerStatus(id, status) {
  const approvedAt = status === 'approved' ? now() : null;
  db.prepare('UPDATE organizers SET status = ?, approved_at = COALESCE(?, approved_at) WHERE id = ?').run(status, approvedAt, id);
}
function listPendingOrganizers() {
  return db.prepare("SELECT * FROM organizers WHERE status = 'pending' ORDER BY created_at ASC").all();
}
function roleForEmail(email) {
  email = String(email || '').toLowerCase();
  if (!email) return 'anon';
  if (email === adminEmail) return 'admin';
  const org = findOrganizerByEmail(email);
  if (!org) return 'new';
  return org.status; // approved | pending | rejected | revoked
}
function countSignupsToday() {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return db.prepare('SELECT COUNT(*) n FROM organizers WHERE created_at > ?').get(since).n;
}

// ─── Events ──────────────────────────────────────────────────
function purgeDateFor(data, created) {
  const base = data.exchange_date || String(created).slice(0, 10);
  return addDaysToDate(base, data.exchange_date ? purgeDays : 90);
}
function createEvent(data, organizer) {
  const created = now();
  const info = db.prepare(`
    INSERT INTO events (organizer_id, name, details, location, exchange_date, budget, wishlist_deadline,
                        status, created_at, purge_after)
    VALUES (@organizer_id, @name, @details, @location, @exchange_date, @budget, @wishlist_deadline,
            'setup', @created_at, @purge_after)
  `).run({
    organizer_id: organizer.id,
    name: data.name, details: data.details || null, location: data.location || null,
    exchange_date: data.exchange_date || null, budget: data.budget || null,
    wishlist_deadline: data.wishlist_deadline || null,
    created_at: created, purge_after: purgeDateFor(data, created),
  });
  return getEvent(info.lastInsertRowid);
}
const _eventById = db.prepare('SELECT * FROM events WHERE id = ?');
function getEvent(id) { return _eventById.get(id); }
function getEventForOrganizer(id, organizerId, isAdmin = false) {
  const ev = getEvent(id);
  if (!ev) return null;
  if (!isAdmin && ev.organizer_id !== organizerId) return null;
  return ev;
}
function listEventsByOrganizer(organizerId) {
  return db.prepare('SELECT * FROM events WHERE organizer_id = ? ORDER BY created_at DESC').all(organizerId);
}
function listAllEvents() {
  return db.prepare(`SELECT e.*, o.email AS organizer_email FROM events e JOIN organizers o ON o.id = e.organizer_id ORDER BY e.created_at DESC`).all();
}
function updateEvent(id, data) {
  const ev = getEvent(id);
  db.prepare(`
    UPDATE events SET name=@name, details=@details, location=@location, exchange_date=@exchange_date,
      budget=@budget, wishlist_deadline=@wishlist_deadline, purge_after=@purge_after, updated_at=@updated_at
    WHERE id=@id
  `).run({
    id, name: data.name, details: data.details || null, location: data.location || null,
    exchange_date: data.exchange_date || null, budget: data.budget || null,
    wishlist_deadline: data.wishlist_deadline || null,
    purge_after: purgeDateFor(data, ev.created_at), updated_at: now(),
  });
  return getEvent(id);
}
function setEventStatus(id, status) { db.prepare('UPDATE events SET status=?, updated_at=? WHERE id=?').run(status, now(), id); }
function markDrawn(id) { db.prepare("UPDATE events SET status='drawn', drawn_at=?, updated_at=? WHERE id=?").run(now(), now(), id); }
function deleteEvent(id) { db.prepare('DELETE FROM events WHERE id=?').run(id); }
function closeEventsForOrganizer(orgId) {
  db.prepare("UPDATE events SET status='closed', updated_at=? WHERE organizer_id=? AND status IN ('setup','drawn')").run(now(), orgId);
}
function countActiveEventsByOrganizer(orgId) {
  return db.prepare("SELECT COUNT(*) n FROM events WHERE organizer_id=? AND status IN ('setup','drawn')").get(orgId).n;
}
function countGlobalActiveEvents() {
  return db.prepare("SELECT COUNT(*) n FROM events WHERE status IN ('setup','drawn')").get().n;
}
function countEventsCreatedTodayByOrganizer(orgId) {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  return db.prepare('SELECT COUNT(*) n FROM events WHERE organizer_id=? AND created_at > ?').get(orgId, since).n;
}

// ─── Members ─────────────────────────────────────────────────
function addMember(eventId, { name, email }) {
  const info = db.prepare('INSERT INTO members(event_id, name, email, token, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(eventId, name, email, makeToken(), now());
  return getMember(info.lastInsertRowid);
}
function getMember(id) { return db.prepare('SELECT * FROM members WHERE id=?').get(id); }
function getMemberByToken(token) { return db.prepare('SELECT * FROM members WHERE token=?').get(token); }
function listMembers(eventId) { return db.prepare('SELECT * FROM members WHERE event_id=? ORDER BY created_at, id').all(eventId); }
function countMembers(eventId) { return db.prepare('SELECT COUNT(*) n FROM members WHERE event_id=?').get(eventId).n; }
function updateMemberEmail(id, email) { db.prepare('UPDATE members SET email=? WHERE id=?').run(email, id); }
function updateMemberName(id, name) { db.prepare('UPDATE members SET name=? WHERE id=?').run(name, id); }
function deleteMember(id) { db.prepare('DELETE FROM members WHERE id=?').run(id); }
function markOpened(id) { db.prepare('UPDATE members SET opened_at = COALESCE(opened_at, ?) WHERE id=?').run(now(), id); }
function markRevealed(id) { db.prepare('UPDATE members SET revealed_at = COALESCE(revealed_at, ?) WHERE id=?').run(now(), id); }
function markNotified(id) { db.prepare('UPDATE members SET notified_at=? WHERE id=?').run(now(), id); }

// Assignments (giver -> receiver). Never expose the reverse lookup.
function setAssignments(map) {
  const stmt = db.prepare('UPDATE members SET assigned_to_member_id=? WHERE id=?');
  const tx = db.transaction((pairs) => { for (const [giver, receiver] of pairs) stmt.run(receiver, giver); });
  tx([...map.entries()]);
}
function clearAssignments(eventId) {
  db.prepare('UPDATE members SET assigned_to_member_id=NULL, revealed_at=NULL WHERE event_id=?').run(eventId);
}

// ─── Exclusions ──────────────────────────────────────────────
function addExclusion(eventId, a, b) {
  if (a === b) return;
  const exists = db.prepare('SELECT 1 FROM exclusions WHERE event_id=? AND ((member_a_id=? AND member_b_id=?) OR (member_a_id=? AND member_b_id=?))')
    .get(eventId, a, b, b, a);
  if (exists) return;
  db.prepare('INSERT INTO exclusions(event_id, member_a_id, member_b_id) VALUES(?, ?, ?)').run(eventId, a, b);
}
function listExclusions(eventId) {
  return db.prepare(`
    SELECT x.id, x.member_a_id, x.member_b_id, a.name AS a_name, b.name AS b_name
    FROM exclusions x JOIN members a ON a.id=x.member_a_id JOIN members b ON b.id=x.member_b_id
    WHERE x.event_id=? ORDER BY x.id
  `).all(eventId);
}
function exclusionPairs(eventId) {
  return db.prepare('SELECT member_a_id, member_b_id FROM exclusions WHERE event_id=?').all(eventId)
    .map((r) => [r.member_a_id, r.member_b_id]);
}
function deleteExclusion(id, eventId) { db.prepare('DELETE FROM exclusions WHERE id=? AND event_id=?').run(id, eventId); }

// ─── Wishlist ────────────────────────────────────────────────
function addWishlistItem(memberId, { name, link, note }) {
  db.prepare('INSERT INTO wishlist_items(member_id, name, link, note, created_at) VALUES(?, ?, ?, ?, ?)')
    .run(memberId, name, link || null, note || null, now());
}
function listWishlist(memberId) { return db.prepare('SELECT * FROM wishlist_items WHERE member_id=? ORDER BY created_at, id').all(memberId); }
function getWishlistItem(id) { return db.prepare('SELECT * FROM wishlist_items WHERE id=?').get(id); }
function updateWishlistItem(id, { name, link, note }) {
  db.prepare('UPDATE wishlist_items SET name=?, link=?, note=? WHERE id=?').run(name, link || null, note || null, id);
}
function deleteWishlistItem(id) { db.prepare('DELETE FROM wishlist_items WHERE id=?').run(id); }
function countWishlist(memberId) { return db.prepare('SELECT COUNT(*) n FROM wishlist_items WHERE member_id=?').get(memberId).n; }

// Member status for the organiser dashboard (NO assignment mapping).
function memberStatus(eventId) {
  return db.prepare(`
    SELECT m.id, m.name, m.email, m.opened_at, m.revealed_at, m.notified_at,
           (SELECT COUNT(*) FROM wishlist_items w WHERE w.member_id=m.id) AS wishlist_count
    FROM members m WHERE m.event_id=? ORDER BY m.created_at, m.id
  `).all(eventId);
}
// Members never emailed their draw result (crash/limit during the send loop).
function membersUnnotified(eventId) {
  return db.prepare(`
    SELECT m.* FROM members m
    WHERE m.event_id=? AND m.notified_at IS NULL AND m.assigned_to_member_id IS NOT NULL
    ORDER BY m.created_at
  `).all(eventId);
}

// Members with an empty wishlist (for nudges).
function membersWithEmptyWishlist(eventId) {
  return db.prepare(`
    SELECT m.* FROM members m
    WHERE m.event_id=? AND (SELECT COUNT(*) FROM wishlist_items w WHERE w.member_id=m.id)=0
    ORDER BY m.created_at
  `).all(eventId);
}

module.exports = {
  addDaysToDate, today,
  // organizers
  findOrganizerByEmail, getOrganizer, ensureOrganizer, setOrganizerStatus, listPendingOrganizers,
  roleForEmail, countSignupsToday,
  // events
  createEvent, getEvent, getEventForOrganizer, listEventsByOrganizer, listAllEvents, updateEvent,
  setEventStatus, markDrawn, deleteEvent, closeEventsForOrganizer,
  countActiveEventsByOrganizer, countGlobalActiveEvents, countEventsCreatedTodayByOrganizer,
  // members
  addMember, getMember, getMemberByToken, listMembers, countMembers, updateMemberEmail, updateMemberName,
  deleteMember, markOpened, markRevealed, markNotified, setAssignments, clearAssignments,
  // exclusions
  addExclusion, listExclusions, exclusionPairs, deleteExclusion,
  // wishlist
  addWishlistItem, listWishlist, getWishlistItem, updateWishlistItem, deleteWishlistItem, countWishlist,
  // status
  memberStatus, membersWithEmptyWishlist, membersUnnotified,
};
