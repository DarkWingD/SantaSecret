'use strict';
// Create a demo Secret Santa (drawn) for local dev, and print member links.
const config = require('./config');
const m = require('./models');
const { draw } = require('./draw');

const adminEmail = config.adminEmail || 'admin@example.com';
let org = m.ensureOrganizer(adminEmail);
if (org.status !== 'approved') { m.setOrganizerStatus(org.id, 'approved'); org = m.getOrganizer(org.id); }

const event = m.createEvent({
  name: 'Demo Secret Santa',
  details: 'Bring your festive spirit! 🎄',
  location: 'The office',
  exchange_date: m.addDaysToDate(m.today(), 21),
  budget: '$30',
  wishlist_deadline: null,
}, org);

const people = [['Sarah', 'sarah@example.com'], ['Tom', 'tom@example.com'], ['Priya', 'priya@example.com'], ['Alex', 'alex@example.com']];
const members = people.map(([name, email]) => m.addMember(event.id, { name, email }));

m.addWishlistItem(members[0].id, { name: 'Wireless earbuds', link: 'https://example.com', note: 'black, over-ear' });
m.addWishlistItem(members[0].id, { name: 'A good book', link: null, note: 'sci-fi' });

const res = draw(members.map((x) => x.id), []);
if (res.ok) { m.setAssignments(res.assignments); m.markDrawn(event.id); }

console.log(`\nSeeded "${event.name}" (id ${event.id}, status ${event.status}) — organiser ${adminEmail}`);
console.log('\nMember links (open one to see the reveal):');
for (const mem of members) console.log(`  ${mem.name.padEnd(7)} ${config.baseUrl}/m/${mem.token}`);
console.log('\nOrganiser dashboard: ' + config.baseUrl + '/organiser\n');
process.exit(0);
