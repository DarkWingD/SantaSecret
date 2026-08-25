'use strict';
// Lightweight test for the draw. Run: npm run test:draw
const assert = require('assert');
const { draw } = require('./draw');

function isValid(memberIds, exclusions, assignments) {
  // derangement: no self-assignment
  for (const id of memberIds) assert.notStrictEqual(assignments.get(id), id, 'self-assignment');
  // bijection: every member receives exactly once
  const received = new Set(assignments.values());
  assert.strictEqual(received.size, memberIds.length, 'not a bijection');
  // single cycle: following the chain visits everyone before returning
  let cur = memberIds[0]; let steps = 0;
  do { cur = assignments.get(cur); steps++; } while (cur !== memberIds[0] && steps <= memberIds.length + 1);
  assert.strictEqual(steps, memberIds.length, 'not a single cycle');
  // exclusions respected
  const forbidden = new Set();
  for (const [a, b] of exclusions) { forbidden.add(a + '|' + b); forbidden.add(b + '|' + a); }
  for (const [g, r] of assignments) assert.ok(!forbidden.has(g + '|' + r), 'excluded pair assigned');
}

let passed = 0;
for (let n = 3; n <= 12; n++) {
  const ids = Array.from({ length: n }, (_, i) => i + 1);
  for (let trial = 0; trial < 200; trial++) {
    // random exclusions (few, to stay feasible)
    const exclusions = [];
    const k = Math.floor(Math.random() * Math.min(2, n - 2));
    for (let e = 0; e < k; e++) {
      const a = ids[Math.floor(Math.random() * n)];
      let b = ids[Math.floor(Math.random() * n)];
      if (a !== b) exclusions.push([a, b]);
    }
    const res = draw(ids, exclusions);
    assert.ok(res.ok, `draw failed for n=${n}`);
    isValid(ids, exclusions, res.assignments);
    passed++;
  }
}

// Infeasible: 3 members where one is excluded from both others in a way that blocks a cycle.
const infeasible = draw([1, 2], [[1, 2]]); // only cycle is 1<->2 which is excluded
assert.ok(!infeasible.ok, 'should be infeasible');

console.log(`draw.test: ${passed} random cases passed; infeasible case handled.`);
process.exit(0);
