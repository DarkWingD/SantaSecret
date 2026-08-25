'use strict';
// Delete events (and cascade their guests) whose purge date has passed.
// Run as a script (`npm run purge`) via a nightly timer, and also scheduled in-process.
const { db } = require('./db');
const { nowLocalDateStr } = require('./time');

function runPurge() {
  const today = nowLocalDateStr();
  const info = db.prepare('DELETE FROM events WHERE purge_after < ?').run(today);
  // Never-approved requesters with no events are just stored email addresses;
  // drop them after 30 days. Rejected/revoked rows stay as a re-request blocklist.
  const cutoff = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
  db.prepare(`
    DELETE FROM organizers WHERE status = 'pending' AND created_at < ?
      AND NOT EXISTS (SELECT 1 FROM events WHERE events.organizer_id = organizers.id)
  `).run(cutoff);
  return info.changes;
}

if (require.main === module) {
  const n = runPurge();
  console.log(`[purge] removed ${n} expired event(s) as of ${nowLocalDateStr()}`);
  process.exit(0);
}

module.exports = { runPurge };
