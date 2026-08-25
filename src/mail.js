'use strict';
// Transactional email via Resend. Blank RESEND_API_KEY disables email (logs instead).
const { mail, baseUrl, adminEmail } = require('./config');
const { formatDate } = require('./time');
const { emailBlocked, blockEmailThisMonth } = require('./db');

let resend = null;
if (mail.enabled) { const { Resend } = require('resend'); resend = new Resend(mail.resendKey); }

function isMonthlyLimit(err) {
  if (!err) return false;
  const code = err.statusCode || err.status || 0;
  const s = `${err.name || ''} ${err.message || ''}`.toLowerCase();
  if (/rate/.test(s)) return false;
  return code === 402 || /limit|quota|exceeded|maximum reached|reached your/.test(s);
}

async function send({ to, subject, html, text }) {
  if (!resend) { console.log(`[mail:disabled] to=${to} subject="${subject}"`); return { ok: false, disabled: true }; }
  if (emailBlocked()) return { ok: false, blocked: true };
  try {
    const res = await resend.emails.send({ from: mail.from, to, subject, html, text });
    if (res && res.error) {
      const limit = isMonthlyLimit(res.error);
      if (limit) blockEmailThisMonth();
      console.error('[mail:error]', res.error.message || res.error);
      return { ok: false, error: res.error.message || 'send failed', limit };
    }
    return { ok: true, id: res && res.data ? res.data.id : null };
  } catch (err) {
    const limit = isMonthlyLimit(err);
    if (limit) blockEmailThisMonth();
    console.error('[mail:error]', (err && err.message) || err);
    return { ok: false, error: (err && err.message) || 'send failed', limit };
  }
}

function esc(s) { return String(s || '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

function eventLines(event) {
  const bits = [];
  if (event.exchange_date) bits.push(`📅 ${esc(formatDate(event.exchange_date))}`);
  if (event.location) bits.push(`📍 ${esc(event.location)}`);
  if (event.budget) bits.push(`💰 ${esc(event.budget)}`);
  return bits.length ? `<p style="color:#556">${bits.join(' &nbsp;·&nbsp; ')}</p>` : '';
}

// Admin gets pinged on a new access request.
async function notifyAdminNewRequest(org) {
  const link = `${baseUrl}/admin`;
  return send({
    to: adminEmail,
    subject: `Secret Santa: access request from ${org.email}`,
    text: `${org.email} requested to run Secret Santa events.\nReview: ${link}`,
    html: `<p><strong>${esc(org.email)}</strong> requested access to run Secret Santa events.</p><p><a href="${link}">Review in admin</a></p>`,
  });
}
async function notifyRequesterApproved(org) {
  const link = `${baseUrl}/organiser`;
  return send({
    to: org.email,
    subject: 'You can now run Secret Santa events',
    text: `You're approved. Create your first event: ${link}`,
    html: `<p>Good news — you're approved to run Secret Santa events.</p><p><a href="${link}">Open your organiser dashboard</a></p>`,
  });
}

// The big one: on draw, each member is emailed WHO THEY'RE BUYING FOR + their link.
async function sendDrawNotification(event, member, recipientName) {
  const link = `${baseUrl}/m/${member.token}`;
  const subject = `🎁 You're in "${event.name}" — here's who you got`;
  const text = `Hi ${member.name},\n\nThe draw for "${event.name}" is done!\n\n`
    + `YOU'RE BUYING FOR: ${recipientName}\n\n`
    + `Open your page to see their wishlist and add your own ideas: ${link}`;
  const html = `<div style="font-family:system-ui,Segoe UI,Arial,sans-serif;max-width:520px">
    <p>Hi ${esc(member.name)},</p>
    <p>The draw for <strong>${esc(event.name)}</strong> is done! 🎉</p>
    ${eventLines(event)}
    <div style="margin:18px 0;padding:18px 20px;border-radius:14px;background:#0f5132;color:#fff;text-align:center">
      <div style="font-size:13px;letter-spacing:.08em;text-transform:uppercase;opacity:.85">You're buying for</div>
      <div style="font-size:26px;font-weight:800;margin-top:4px">🎁 ${esc(recipientName)}</div>
    </div>
    <p><a href="${link}" style="display:inline-block;padding:11px 18px;border-radius:10px;background:#b02a2a;color:#fff;text-decoration:none;font-weight:600">See their wishlist &amp; add yours</a></p>
    <p style="color:#889;font-size:13px">Keep it secret — this is just for you!</p>
  </div>`;
  return send({ to: member.email, subject, text, html });
}

// Organiser-triggered nudge to members with an empty wishlist.
async function sendWishlistNudge(event, member) {
  const link = `${baseUrl}/m/${member.token}`;
  const subject = `Don't forget your wishlist for "${event.name}"`;
  const text = `Hi ${member.name},\n\nAdd a few gift ideas so your Secret Santa knows what you'd like: ${link}`;
  const html = `<p>Hi ${esc(member.name)},</p><p>Add a few gift ideas for <strong>${esc(event.name)}</strong> so your Secret Santa knows what you'd like:</p>${eventLines(event)}<p><a href="${link}">Add your wishlist</a></p>`;
  return send({ to: member.email, subject, text, html });
}

module.exports = { send, notifyAdminNewRequest, notifyRequesterApproved, sendDrawNotification, sendWishlistNudge };
