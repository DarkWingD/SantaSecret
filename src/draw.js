'use strict';
// Secret Santa draw: produce a single random cycle over the members so everyone gives to and
// receives from exactly one other person, nobody draws themselves, and no excluded pair is
// placed adjacent (giver -> receiver). A single cycle also avoids trivial 2-way swaps for n >= 3.

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// memberIds: array of ids. exclusionPairs: array of [a, b] (treated symmetrically).
// Returns { ok: true, assignments: Map<giverId, receiverId> } or { ok: false, reason }.
function draw(memberIds, exclusionPairs = [], attempts = 5000) {
  if (memberIds.length < 2) return { ok: false, reason: 'need at least 2 members' };

  const forbidden = new Set();
  for (const [a, b] of exclusionPairs) {
    forbidden.add(a + '|' + b);
    forbidden.add(b + '|' + a);
  }

  for (let t = 0; t < attempts; t++) {
    const order = shuffle(memberIds.slice());
    let ok = true;
    for (let i = 0; i < order.length; i++) {
      const giver = order[i];
      const receiver = order[(i + 1) % order.length];
      if (forbidden.has(giver + '|' + receiver)) { ok = false; break; }
    }
    if (ok) {
      const assignments = new Map();
      for (let i = 0; i < order.length; i++) {
        assignments.set(order[i], order[(i + 1) % order.length]);
      }
      return { ok: true, assignments };
    }
  }
  return { ok: false, reason: 'could not satisfy the exclusions — try removing some or adding members' };
}

module.exports = { draw };
