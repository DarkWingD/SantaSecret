'use strict';
// Progressive enhancements. The app works without JS; this adds polish.
// Loaded from <head> (not deferred) so the colour scheme applies before first paint.

// ── Colour scheme: auto by default, with a manual override ──
(function () {
  var KEY = 'ss-mode';
  function read() { try { return localStorage.getItem(KEY) || 'auto'; } catch (e) { return 'auto'; } }
  function apply(mode) {
    var el = document.documentElement;
    if (mode === 'light' || mode === 'dark') el.setAttribute('data-mode', mode);
    else el.removeAttribute('data-mode');
  }
  apply(read());
  window.__ssTheme = { get: read, set: function (m) { try { localStorage.setItem(KEY, m); } catch (e) {} apply(m); } };
})();

var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function confetti() {
  if (reduceMotion) return;
  var colors = ['#0f5132', '#b02a2a', '#c9a227', '#ffffff', '#157347'];
  for (var i = 0; i < 44; i++) {
    var p = document.createElement('div');
    p.className = 'confetti-piece';
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[Math.floor(Math.random() * colors.length)];
    p.style.opacity = '0';
    var dur = 1.6 + Math.random() * 1.6;
    p.style.animationDuration = dur + 's';
    p.style.animationDelay = (Math.random() * 0.3) + 's';
    p.style.transform = 'translateY(0) rotate(' + (Math.random() * 360) + 'deg)';
    document.body.appendChild(p);
    (function (el, d) { setTimeout(function () { el.remove(); }, (d + 0.6) * 1000); })(p, dur);
  }
}

function snowEnabled() { try { return localStorage.getItem('ss-snow') !== 'off'; } catch (e) { return true; } }
function clearSnow() { var c = document.querySelector('.snow'); if (c) c.innerHTML = ''; }
function makeSnow() {
  if (reduceMotion || !snowEnabled()) return;
  var container = document.querySelector('.snow');
  if (!container) return;
  clearSnow();
  var glyphs = ['❄', '❅', '❆'];
  var n = window.innerWidth < 600 ? 24 : 42;
  for (var i = 0; i < n; i++) {
    var s = document.createElement('span');
    s.className = 'snowflake';
    s.textContent = glyphs[Math.floor(Math.random() * glyphs.length)];
    var dur = 6 + Math.random() * 9;
    s.style.left = (Math.random() * 100) + 'vw';
    s.style.fontSize = (9 + Math.random() * 15).toFixed(1) + 'px';
    s.style.opacity = (0.45 + Math.random() * 0.5).toFixed(2);
    s.style.animationDuration = dur + 's';
    s.style.animationDelay = (-Math.random() * dur).toFixed(2) + 's';
    s.style.setProperty('--drift', (Math.random() * 80 - 40).toFixed(0) + 'px');
    container.appendChild(s);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  makeSnow();

  // Snow on/off toggle (remembered per browser). Reduced-motion already hides snow.
  var snowBtn = document.getElementById('snow-toggle');
  if (snowBtn) {
    var renderSnow = function () { snowBtn.classList.toggle('off', !snowEnabled()); };
    renderSnow();
    snowBtn.addEventListener('click', function () {
      if (snowEnabled()) { try { localStorage.setItem('ss-snow', 'off'); } catch (e) {} clearSnow(); }
      else { try { localStorage.setItem('ss-snow', 'on'); } catch (e) {} makeSnow(); }
      renderSnow();
    });
  }

  // Colour-scheme toggle
  var btn = document.getElementById('theme-toggle');
  if (btn) {
    var order = ['auto', 'light', 'dark'];
    var face = { auto: '🌗 Auto', light: '☀️ Light', dark: '🌙 Dark' };
    var render = function () { var mo = window.__ssTheme.get(); btn.textContent = face[mo] || face.auto; btn.setAttribute('aria-label', 'Colour scheme: ' + mo); };
    render();
    btn.addEventListener('click', function () {
      var mo = window.__ssTheme.get();
      window.__ssTheme.set(order[(order.indexOf(mo) + 1) % order.length]); render();
    });
  }

  // The reveal: unwrap animation + confetti, then submit to persist (reloads to the open card).
  var revealBtn = document.getElementById('reveal-btn');
  if (revealBtn) {
    revealBtn.addEventListener('click', function (e) {
      var form = document.getElementById('reveal-form');
      var card = document.getElementById('reveal');
      if (!form) return;
      e.preventDefault();
      if (card) card.classList.add('unwrapping');
      confetti();
      revealBtn.disabled = true;
      setTimeout(function () { form.submit(); }, reduceMotion ? 0 : 900);
    });
  }
});

// Back buttons: <a data-back> goes back in history when possible (else follows href).
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-back]');
  if (b && window.history.length > 1) { e.preventDefault(); window.history.back(); }
});

// Copy buttons: [data-copy] / [data-copy-target]
document.addEventListener('click', function (e) {
  var b = e.target.closest('[data-copy], [data-copy-target]');
  if (!b) return;
  e.preventDefault();
  var text = b.getAttribute('data-copy');
  if (!text) { var el = document.querySelector(b.getAttribute('data-copy-target')); text = el ? (el.value != null ? el.value : el.textContent) : ''; }
  var done = function () { var o = b.textContent; b.textContent = 'Copied!'; setTimeout(function () { b.textContent = o; }, 1200); };
  if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(text).then(done, function () {});
});

// In-app confirmation modal for destructive forms.
function showConfirm(message, onOk) {
  var overlay = document.getElementById('confirm-modal');
  if (!overlay) { if (window.confirm(message)) onOk(); return; }
  document.getElementById('confirm-text').textContent = message;
  var ok = document.getElementById('confirm-ok'); var cancel = document.getElementById('confirm-cancel');
  overlay.hidden = false;
  function cleanup() { overlay.hidden = true; ok.removeEventListener('click', okc); cancel.removeEventListener('click', cleanup); overlay.removeEventListener('click', bd); document.removeEventListener('keydown', kd); }
  function okc() { cleanup(); onOk(); }
  function bd(ev) { if (ev.target === overlay) cleanup(); }
  function kd(ev) { if (ev.key === 'Escape') cleanup(); else if (ev.key === 'Enter') { cleanup(); onOk(); } }
  ok.addEventListener('click', okc); cancel.addEventListener('click', cleanup); overlay.addEventListener('click', bd); document.addEventListener('keydown', kd);
  ok.focus();
}
document.addEventListener('submit', function (e) {
  var form = e.target;
  if (!(form.matches && form.matches('[data-confirm]'))) return;
  e.preventDefault();
  showConfirm(form.getAttribute('data-confirm'), function () { form.submit(); });
});
