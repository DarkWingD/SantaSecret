'use strict';
const express = require('express');
const path = require('path');
const crypto = require('crypto');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const rateLimit = require('express-rate-limit');

const config = require('./config');
const { formatDate, formatDateTime } = require('./time');
require('./db');
const { runPurge } = require('./purge');

const ASSET_VERSION = Date.now().toString(36);

const app = express();
app.set('trust proxy', true);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, '..', 'views'));

app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", 'https://challenges.cloudflare.com'],
      frameSrc: ['https://challenges.cloudflare.com'],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'", 'https://challenges.cloudflare.com'],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'self'"],
    },
  },
}));

const postLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, max: 300, standardHeaders: true, legacyHeaders: false,
  keyGenerator: (req) => req.headers['cf-connecting-ip'] || req.ip,
  validate: { trustProxy: false },
});
app.use((req, res, next) => (req.method === 'POST' ? postLimiter(req, res, next) : next()));

app.use(cookieParser(config.secret));
app.use(express.urlencoded({ extended: false, limit: '256kb' }));
app.use(express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

// CSRF synchroniser token in a signed cookie.
app.use((req, res, next) => {
  let token = req.signedCookies && req.signedCookies.csrf;
  if (!token) {
    token = crypto.randomBytes(24).toString('hex');
    res.cookie('csrf', token, { httpOnly: true, sameSite: 'lax', secure: config.isHttps, signed: true });
  }
  res.locals.csrfToken = token;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    if (!req.body || req.body._csrf !== token) {
      return res.status(403).render('error', { title: 'Session expired', message: 'Your form session expired. Please go back and try again.' });
    }
  }
  next();
});

app.use((req, res, next) => {
  res.locals.fmtDate = formatDate;
  res.locals.fmtDateTime = formatDateTime;
  res.locals.baseUrl = config.baseUrl;
  res.locals.turnstileSiteKey = config.turnstile.siteKey;
  res.locals.assetVer = ASSET_VERSION;
  res.locals.currentPath = req.path;
  next();
});

app.get('/', (req, res) => res.render('home', { title: 'Secret Santa' }));
app.get('/privacy', (req, res) => res.render('privacy', { title: 'Privacy', purgeDays: config.purgeDays }));
app.use('/m', require('./routes/member'));
app.use('/organiser', require('./routes/organiser'));
app.use('/admin', require('./routes/admin'));

app.use((req, res) => res.status(404).render('error', { title: 'Not found', message: 'That page could not be found.' }));
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('[error]', err && err.stack ? err.stack : err);
  res.status(500).render('error', { title: 'Something went wrong', message: 'An unexpected error occurred.' });
});

try { runPurge(); } catch (e) { console.error('[purge:startup]', e.message); }
setInterval(() => { try { runPurge(); } catch (e) { console.error('[purge:interval]', e.message); } }, 6 * 3600 * 1000);

if (config.devBypassAuth && config.cf.teamDomain) {
  console.error('FATAL: DEV_BYPASS_AUTH=true while Cloudflare Access is configured. Refusing to start.');
  process.exit(1);
}

app.listen(config.port, '127.0.0.1', () => {
  console.log(`Secret Santa listening on http://127.0.0.1:${config.port}  (public: ${config.baseUrl})`);
  if (config.devBypassAuth) console.warn('⚠  DEV_BYPASS_AUTH is ON — authentication is bypassed. Do NOT use in production.');
});
