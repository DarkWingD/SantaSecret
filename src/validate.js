'use strict';
// Input parsing & validation. Returns { errors: [...], data: {...} }.
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function cleanStr(v, max) { return String(v == null ? '' : v).trim().slice(0, max); }

function parseEventForm(body) {
  const errors = [];
  const name = cleanStr(body.name, 120);
  if (!name) errors.push('Event name is required.');

  let exchange_date = cleanStr(body.exchange_date, 10) || null;
  if (exchange_date && !DATE_RE.test(exchange_date)) { errors.push('Exchange date is invalid.'); exchange_date = null; }

  let wishlist_deadline = cleanStr(body.wishlist_deadline, 10) || null;
  if (wishlist_deadline && !DATE_RE.test(wishlist_deadline)) { errors.push('Wishlist deadline is invalid.'); wishlist_deadline = null; }

  return {
    errors,
    data: {
      name,
      details: cleanStr(body.details, 4000) || null,
      location: cleanStr(body.location, 300) || null,
      exchange_date,
      budget: cleanStr(body.budget, 60) || null,
      wishlist_deadline,
    },
  };
}

function parseMember(body) {
  const errors = [];
  const name = cleanStr(body.member_name, 120);
  const email = cleanStr(body.member_email, 200).toLowerCase();
  if (!name) errors.push('Name is required.');
  if (!email) errors.push('Email is required.');
  else if (!EMAIL_RE.test(email)) errors.push('That email doesn’t look valid.');
  return { errors, data: { name, email } };
}

function isEmail(v) { return EMAIL_RE.test(String(v || '').trim().toLowerCase()); }

function parseWishlistItem(body) {
  const errors = [];
  const name = cleanStr(body.item_name, 200);
  if (!name) errors.push('Give the idea a name.');
  let link = cleanStr(body.item_link, 500) || null;
  if (link && !/^https?:\/\/\S+$/i.test(link)) { errors.push('Link must start with http:// or https://'); }
  const note = cleanStr(body.item_note, 500) || null;
  return { errors, data: { name, link, note } };
}

module.exports = { cleanStr, isEmail, parseEventForm, parseMember, parseWishlistItem };
