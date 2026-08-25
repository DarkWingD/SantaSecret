'use strict';
// Organiser area — behind Cloudflare Access. Roles: admin/approved manage; pending/rejected/revoked
// see status pages; new → request access.
const express = require('express');
const router = express.Router();
const { requireAuth } = require('../auth');
const m = require('../models');
const config = require('../config');
const { signupsPaused, emailBlocked } = require('../db');
const { parseEventForm, parseMember, isEmail } = require('../validate');
const { verifyTurnstile } = require('../turnstile');
const { notifyAdminNewRequest, sendDrawNotification, sendWishlistNudge } = require('../mail');
const { draw } = require('../draw');

router.use(requireAuth());

const canManage = (role) => role === 'admin' || role === 'approved';
function currentOrganizer(req) {
  if (req.organizer) return req.organizer;
  if (req.role === 'admin') { req.organizer = m.ensureOrganizer(req.userEmail); return req.organizer; }
  return null;
}
const back = (req, extra) => `/organiser/events/${req.event.id}${extra || ''}`;
const q = (s) => encodeURIComponent(s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function eventToForm(ev) {
  return {
    name: ev.name, details: ev.details || '', location: ev.location || '',
    exchange_date: ev.exchange_date || '', budget: ev.budget || '', wishlist_deadline: ev.wishlist_deadline || '',
  };
}

// ─── Dashboard / role routing ────────────────────────────────
router.get('/', (req, res) => {
  if (canManage(req.role)) {
    const org = currentOrganizer(req);
    const events = m.listEventsByOrganizer(org.id).map((e) => Object.assign({}, e, { member_count: m.countMembers(e.id) }));
    return res.render('organiser/dashboard', { title: 'Your Secret Santas', events });
  }
  if (req.role === 'pending') return res.render('organiser/pending', { title: 'Awaiting approval' });
  if (req.role === 'rejected' || req.role === 'revoked') return res.render('organiser/blocked', { title: 'Not available', status: req.role });
  return res.render('organiser/request', { title: 'Request access', paused: signupsPaused(), values: {}, error: null, turnstile: config.turnstile.enabled });
});

router.post('/request', async (req, res) => {
  if (req.role !== 'new') return res.redirect('/organiser');
  const rerender = (status, error) => res.status(status).render('organiser/request', { title: 'Request access', paused: signupsPaused(), values: req.body, error, turnstile: config.turnstile.enabled });
  if (signupsPaused()) return rerender(403, 'New requests are paused right now. Please check back later.');
  if (m.countSignupsToday() >= config.caps.signupsPerDay) return rerender(429, 'We are receiving a lot of requests. Please try again later.');
  const ok = await verifyTurnstile(req.body['cf-turnstile-response'], req.ip);
  if (!ok) return rerender(400, 'Captcha check failed. Please try again.');
  const org = m.ensureOrganizer(req.userEmail, (req.body.display_name || '').trim().slice(0, 120) || null);
  await notifyAdminNewRequest(org);
  res.render('organiser/pending', { title: 'Request received' });
});

// ─── Create event ────────────────────────────────────────────
router.get('/events/new', (req, res) => {
  if (!canManage(req.role)) return res.redirect('/organiser');
  res.render('organiser/event_form', { title: 'New Secret Santa', mode: 'new', event: null, values: {}, error: null });
});
router.post('/events', (req, res) => {
  if (!canManage(req.role)) return res.redirect('/organiser');
  const org = currentOrganizer(req);
  const fail = (s, error) => res.status(s).render('organiser/event_form', { title: 'New Secret Santa', mode: 'new', event: null, values: req.body, error });
  if (m.countActiveEventsByOrganizer(org.id) >= config.caps.activeEventsPerOrg) return fail(429, `You've reached the maximum of ${config.caps.activeEventsPerOrg} active events.`);
  if (m.countEventsCreatedTodayByOrganizer(org.id) >= config.caps.eventsPerDay) return fail(429, 'You have created a lot of events today. Try again tomorrow.');
  if (m.countGlobalActiveEvents() >= config.caps.globalActiveEvents) return fail(503, 'The system is at capacity right now. Please try again later.');
  const { errors, data } = parseEventForm(req.body);
  if (errors.length) return fail(400, errors.join(' '));
  const ev = m.createEvent(data, org);
  res.redirect(`/organiser/events/${ev.id}`);
});

// ─── Manage a single event ───────────────────────────────────
function loadOwnedEvent(req, res, next) {
  if (!canManage(req.role)) return res.redirect('/organiser');
  const org = currentOrganizer(req);
  const ev = m.getEventForOrganizer(parseInt(req.params.id, 10), org ? org.id : -1, req.role === 'admin');
  if (!ev) return res.status(404).render('error', { title: 'Not found', message: 'Event not found.' });
  req.event = ev;
  next();
}

router.get('/events/:id', loadOwnedEvent, (req, res) => {
  res.render('organiser/manage', {
    title: req.event.name, event: req.event,
    members: m.memberStatus(req.event.id),
    exclusions: m.listExclusions(req.event.id),
    memberCount: m.countMembers(req.event.id),
    emptyCount: m.membersWithEmptyWishlist(req.event.id).length,
    unnotifiedCount: req.event.status === 'drawn' ? m.membersUnnotified(req.event.id).length : 0,
    minMembers: config.minMembers, caps: config.caps,
    mailEnabled: config.mail.enabled, emailCapped: emailBlocked(),
    msg: req.query.msg || null, error: req.query.err || null,
  });
});

router.get('/events/:id/edit', loadOwnedEvent, (req, res) => {
  res.render('organiser/event_form', { title: 'Edit event', mode: 'edit', event: req.event, values: eventToForm(req.event), error: null });
});
router.post('/events/:id/edit', loadOwnedEvent, (req, res) => {
  const { errors, data } = parseEventForm(req.body);
  if (errors.length) return res.status(400).render('organiser/event_form', { title: 'Edit event', mode: 'edit', event: req.event, values: req.body, error: errors.join(' ') });
  m.updateEvent(req.event.id, data);
  res.redirect(back(req));
});

// ─── Members ─────────────────────────────────────────────────
router.post('/events/:id/members', loadOwnedEvent, (req, res) => {
  if (m.countMembers(req.event.id) >= config.caps.membersPerEvent) return res.redirect(back(req, '?err=' + q('Member limit reached.')));
  const { errors, data } = parseMember(req.body);
  if (errors.length) return res.redirect(back(req, '?err=' + q(errors.join(' '))));
  m.addMember(req.event.id, data);
  res.redirect(back(req, '?msg=' + q(`Added ${data.name}`)));
});
function loadMember(req) {
  const mem = m.getMember(parseInt(req.params.mid, 10));
  return (mem && mem.event_id === req.event.id) ? mem : null;
}
router.post('/events/:id/members/:mid/email', loadOwnedEvent, (req, res) => {
  const mem = loadMember(req); if (!mem) return res.redirect(back(req));
  const email = String(req.body.email || '').trim().toLowerCase().slice(0, 200);
  if (!email || !isEmail(email)) return res.redirect(back(req, '?err=' + q('That email doesn’t look valid.')));
  m.updateMemberEmail(mem.id, email);
  res.redirect(back(req, '?msg=' + q(`Updated ${mem.name}'s email`)));
});
router.post('/events/:id/members/:mid/delete', loadOwnedEvent, (req, res) => {
  const mem = loadMember(req); if (mem) m.deleteMember(mem.id);
  res.redirect(back(req, '?msg=' + q('Member removed. Re-draw if you had already drawn.')));
});

// ─── Exclusions ──────────────────────────────────────────────
router.post('/events/:id/exclusions', loadOwnedEvent, (req, res) => {
  const a = parseInt(req.body.member_a, 10); const b = parseInt(req.body.member_b, 10);
  if (a && b && a !== b) m.addExclusion(req.event.id, a, b);
  res.redirect(back(req));
});
router.post('/events/:id/exclusions/:xid/delete', loadOwnedEvent, (req, res) => {
  m.deleteExclusion(parseInt(req.params.xid, 10), req.event.id);
  res.redirect(back(req));
});

// ─── The draw (and re-draw) ──────────────────────────────────
router.post('/events/:id/draw', loadOwnedEvent, async (req, res) => {
  const members = m.listMembers(req.event.id);
  if (members.length < config.minMembers) return res.redirect(back(req, '?err=' + q(`You need at least ${config.minMembers} members to draw.`)));
  if (emailBlocked()) return res.redirect(back(req, '?err=' + q('Email is paused (monthly limit reached) — drawing would not be able to notify members.')));

  const result = draw(members.map((x) => x.id), m.exclusionPairs(req.event.id));
  if (!result.ok) return res.redirect(back(req, '?err=' + q('Draw failed: ' + result.reason)));

  m.clearAssignments(req.event.id);
  m.setAssignments(result.assignments);
  m.markDrawn(req.event.id);

  const nameById = new Map(members.map((x) => [x.id, x.name]));
  let sent = 0; let capped = false;
  for (const mem of members) {
    const recipientName = nameById.get(result.assignments.get(mem.id));
    const r = await sendDrawNotification(req.event, mem, recipientName);
    if (r.ok) { m.markNotified(mem.id); sent += 1; }
    if (r.limit || r.blocked) { capped = true; break; }
    await sleep(550);
  }
  const note = capped ? `Drawn! Emailed ${sent} member(s) before hitting the email limit.` : `Drawn! Emailed all ${sent} member(s) their match.`;
  res.redirect(back(req, '?msg=' + q(note)));
});

// Resend the draw email to members who never received it — the draw's send
// loop stops on the monthly email cap or a crash, and previously the only
// recovery was a full re-draw (which reshuffles everyone).
router.post('/events/:id/resend-unnotified', loadOwnedEvent, async (req, res) => {
  if (req.event.status !== 'drawn') return res.redirect(back(req));
  if (emailBlocked()) return res.redirect(back(req, '?err=' + q('Email is paused this month (monthly limit reached).')));
  const pending = m.membersUnnotified(req.event.id);
  if (!pending.length) return res.redirect(back(req, '?msg=' + q('Everyone has already been emailed their match.')));
  const nameById = new Map(m.listMembers(req.event.id).map((x) => [x.id, x.name]));
  let sent = 0; let capped = false;
  for (const mem of pending) {
    const r = await sendDrawNotification(req.event, mem, nameById.get(mem.assigned_to_member_id));
    if (r.ok) { m.markNotified(mem.id); sent += 1; }
    if (r.limit || r.blocked) { capped = true; break; }
    await sleep(550);
  }
  res.redirect(back(req, '?msg=' + q(capped ? `Sent ${sent} before hitting the email limit.` : `Sent ${sent} draw email(s).`)));
});

// ─── Nudges ──────────────────────────────────────────────────
router.post('/events/:id/nudge', loadOwnedEvent, async (req, res) => {
  if (emailBlocked()) return res.redirect(back(req, '?err=' + q('Email is paused this month (monthly limit reached).')));
  const empties = m.membersWithEmptyWishlist(req.event.id);
  let sent = 0; let capped = false;
  for (const mem of empties) {
    const r = await sendWishlistNudge(req.event, mem);
    if (r.ok) sent += 1;
    if (r.limit || r.blocked) { capped = true; break; }
    await sleep(550);
  }
  res.redirect(back(req, '?msg=' + q(capped ? `Nudged ${sent} before hitting the email limit.` : `Nudged ${sent} member(s) with an empty wishlist.`)));
});
router.post('/events/:id/members/:mid/nudge', loadOwnedEvent, async (req, res) => {
  const mem = loadMember(req); if (!mem) return res.redirect(back(req));
  if (emailBlocked()) return res.redirect(back(req, '?err=' + q('Email is paused this month.')));
  const r = await sendWishlistNudge(req.event, mem);
  res.redirect(back(req, r.ok ? '?msg=' + q(`Nudged ${mem.name}`) : '?err=' + q('Could not send — check the email.')));
});

// ─── Close / export ──────────────────────────────────────────
router.post('/events/:id/close', loadOwnedEvent, (req, res) => { m.setEventStatus(req.event.id, 'closed'); res.redirect(back(req)); });
router.get('/events/:id/export.csv', loadOwnedEvent, (req, res) => {
  const cell = (v) => { v = String(v == null ? '' : v); if (/^[=+\-@\t\r]/.test(v)) v = "'" + v; return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
  const rows = [['Name', 'Email', 'Wishlist items', 'Opened', 'Notified']];
  for (const s of m.memberStatus(req.event.id)) rows.push([s.name, s.email, s.wishlist_count, s.opened_at || '', s.notified_at || '']);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="members.csv"');
  res.send(rows.map((r) => r.map(cell).join(',')).join('\r\n'));
});

module.exports = router;
