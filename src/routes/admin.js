'use strict';
const express = require('express');
const router = express.Router();
const { requireAdmin } = require('../auth');
const m = require('../models');
const { signupsPaused, setSetting, emailBlocked, clearEmailBlock } = require('../db');
const { notifyRequesterApproved } = require('../mail');

router.use(requireAdmin());

router.get('/', (req, res) => res.render('admin/dashboard', {
  title: 'Admin', pending: m.listPendingOrganizers(), paused: signupsPaused(), emailCapped: emailBlocked(),
}));

router.post('/organisers/:id/approve', async (req, res) => {
  const o = m.getOrganizer(parseInt(req.params.id, 10));
  if (o) { m.setOrganizerStatus(o.id, 'approved'); await notifyRequesterApproved(o); }
  res.redirect('/admin');
});
router.post('/organisers/:id/reject', (req, res) => {
  const o = m.getOrganizer(parseInt(req.params.id, 10));
  if (o) m.setOrganizerStatus(o.id, 'rejected');
  res.redirect('/admin');
});
router.post('/organisers/:id/revoke', (req, res) => {
  const o = m.getOrganizer(parseInt(req.params.id, 10));
  if (o) { m.setOrganizerStatus(o.id, 'revoked'); m.closeEventsForOrganizer(o.id); }
  res.redirect('/admin/events');
});

router.get('/events', (req, res) => res.render('admin/events', { title: 'All events', events: m.listAllEvents() }));
router.post('/events/:id/close', (req, res) => { m.setEventStatus(parseInt(req.params.id, 10), 'closed'); res.redirect('/admin/events'); });
router.post('/events/:id/delete', (req, res) => { m.deleteEvent(parseInt(req.params.id, 10)); res.redirect('/admin/events'); });

router.post('/killswitch', (req, res) => { setSetting('signups_paused', signupsPaused() ? '0' : '1'); res.redirect('/admin'); });
router.post('/email/clear', (req, res) => { clearEmailBlock(); res.redirect('/admin'); });

module.exports = router;
