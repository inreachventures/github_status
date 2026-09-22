'use strict';

// Covers applyRepoOrder: turning the on-screen card order (after a drag) back
// into the stored REPOS list, without ever losing a repo.

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadApi } = require('./support/mockFetch');

const REPOS = [
  { name: 'alpha', workflows: ['CI'] },
  { name: 'beta',  workflows: ['CI', 'Deploy'] },
  { name: 'gamma', workflows: ['CI'] },
];

const names = repos => repos.map(r => r.name);

test('applyRepoOrder: reorders the repos to match the card order', () => {
  const { applyRepoOrder } = loadApi();
  assert.deepEqual(names(applyRepoOrder(REPOS, ['gamma', 'alpha', 'beta'])), ['gamma', 'alpha', 'beta']);
});

test('applyRepoOrder: an unchanged card order leaves the list (and its workflows) alone', () => {
  const { applyRepoOrder } = loadApi();
  const out = applyRepoOrder(REPOS, ['alpha', 'beta', 'gamma']);
  assert.deepEqual(out, REPOS);
  assert.deepEqual(out[1].workflows, ['CI', 'Deploy']);
});

test('applyRepoOrder: does not mutate the list it was given', () => {
  const { applyRepoOrder } = loadApi();
  const input = REPOS.slice();
  applyRepoOrder(input, ['gamma', 'beta', 'alpha']);
  assert.deepEqual(names(input), ['alpha', 'beta', 'gamma']);
});

test('applyRepoOrder: repos missing from the card order keep their relative order at the end', () => {
  const { applyRepoOrder } = loadApi();
  // e.g. a card that never got rendered — the repo must survive the drag.
  assert.deepEqual(names(applyRepoOrder(REPOS, ['gamma'])), ['gamma', 'alpha', 'beta']);
  assert.deepEqual(names(applyRepoOrder(REPOS, [])), ['alpha', 'beta', 'gamma']);
});

test('applyRepoOrder: names with no repo behind them are ignored', () => {
  const { applyRepoOrder } = loadApi();
  assert.deepEqual(names(applyRepoOrder(REPOS, ['ghost', 'beta', 'alpha', 'gamma'])), ['beta', 'alpha', 'gamma']);
});
