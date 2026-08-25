'use strict';
// Public member page — no login. The unguessable :token is the capability.
const express = require('express');
const router = express.Router();
const m = require('../models');
const config = require('../config');
const { parseWishlistItem } = require('../validate');

const editHits = new Map();
function rateLimited(token) {
  const nowMs = Date.now();
  const arr = (editHits.get(token) || []).filter((t) => nowMs - t < 3600 * 1000);
  if (arr.length >= config.caps.editsPerHour) return true;
  arr.push(nowMs); editHits.set(token, arr);
  return false;
}
// Sweep stale tokens hourly so the map doesn't grow for the life of the process.
setInterval(() => {
  const cutoff = Date.now() - 3600 * 1000;
  for (const [token, arr] of editHits) {
    if (!arr.some((t) => t > cutoff)) editHits.delete(token);
  }
}, 3600 * 1000).unref();

function loadMember(req, res, next) {
  // Who-you're-buying-for behind a capability URL: never cache it, especially
  // on the shared family devices these links get opened on.
  res.set('Cache-Control', 'no-store');
  const member = m.getMemberByToken(req.params.token);
  if (!member) return res.status(404).render('member/notfound', { title: 'Not found' });
  req.member = member;
  req.event = m.getEvent(member.event_id);
  next();
}

function renderMember(req, res, extra) {
  const ev = req.event;
  const drawn = ev.status === 'drawn';
  let recipient = null; let recipientWishlist = [];
  if (drawn && req.member.assigned_to_member_id) {
    recipient = m.getMember(req.member.assigned_to_member_id);
    if (recipient) recipientWishlist = m.listWishlist(recipient.id);
  }
  res.render('member/page', Object.assign({
    title: ev.name, event: ev, member: req.member, drawn,
    closed: ev.status === 'closed',
    recipient, recipientWishlist,
    revealed: Boolean(req.member.revealed_at),
    myWishlist: m.listWishlist(req.member.id),
    error: null,
  }, extra || {}));
}

router.get('/:token', loadMember, (req, res) => {
  m.markOpened(req.member.id);
  renderMember(req, res);
});

// Mark the first-time reveal as done (fired by the unwrap interaction).
router.post('/:token/reveal', loadMember, (req, res) => {
  m.markRevealed(req.member.id);
  res.redirect(`/m/${req.params.token}`);
});

// ─── Own wishlist ────────────────────────────────────────────
router.post('/:token/wishlist', loadMember, (req, res) => {
  if (rateLimited(req.params.token)) return renderMember(req, res, { error: 'Too many changes just now — please slow down.' });
  if (m.countWishlist(req.member.id) >= config.caps.wishlistItemsPerMember) return renderMember(req, res, { error: 'Wishlist is full.' });
  const { errors, data } = parseWishlistItem(req.body);
  if (errors.length) return renderMember(req, res, { error: errors.join(' ') });
  m.addWishlistItem(req.member.id, data);
  res.redirect(`/m/${req.params.token}#mywishlist`);
});
router.post('/:token/wishlist/:iid/edit', loadMember, (req, res) => {
  const item = m.getWishlistItem(parseInt(req.params.iid, 10));
  if (!item || item.member_id !== req.member.id) return res.redirect(`/m/${req.params.token}`);
  const { errors, data } = parseWishlistItem(req.body);
  if (errors.length) return renderMember(req, res, { error: errors.join(' ') });
  m.updateWishlistItem(item.id, data);
  res.redirect(`/m/${req.params.token}#mywishlist`);
});
router.post('/:token/wishlist/:iid/delete', loadMember, (req, res) => {
  const item = m.getWishlistItem(parseInt(req.params.iid, 10));
  if (item && item.member_id === req.member.id) m.deleteWishlistItem(item.id);
  res.redirect(`/m/${req.params.token}#mywishlist`);
});

module.exports = router;
