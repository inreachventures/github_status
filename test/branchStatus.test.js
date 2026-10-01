'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mockFetch, loadApi } = require('./support/mockFetch');

const REPO = 'example-repo';

// GitHub lists branches alphabetically, 100 per page — `count` names starting
// at `from` keep that ordering so a late-alphabet branch lands on page 2.
const branchPage = (from, count) =>
  Array.from({ length: count }, (_, i) => ({ name: `branch-${String(from + i).padStart(3, '0')}` }));

const pageOf = url => Number(new URL(url).searchParams.get('page'));

test('fetchAllBranches: follows pages past the first 100 so late-alphabet branches are kept', async () => {
  const api = loadApi();
  const calls = mockFetch([
    {
      match: url => url.includes(`/repos/acme-org/${REPO}/branches`),
      respond: url => ({
        status: 200,
        json: pageOf(url) === 1
          ? branchPage(0, 100)
          : [...branchPage(100, 17), { name: 'ws-3-deprecate-alternative-investmentypes' }],
      }),
    },
  ]);

  const names = await api.fetchAllBranches(REPO);

  assert.equal(names.length, 118);
  assert.ok(names.includes('ws-3-deprecate-alternative-investmentypes'));
  assert.deepEqual(calls.map(c => pageOf(c.url)), [1, 2], 'stops once a page comes back short');
});

test('fetchAllBranches: returns null rather than a partial list when a later page fails', async () => {
  const api = loadApi();
  mockFetch([
    {
      match: url => url.includes('/branches'),
      respond: url => (pageOf(url) === 1
        ? { status: 200, json: branchPage(0, 100) }
        : { status: 502, json: {} }),
    },
  ]);

  assert.equal(await api.fetchAllBranches(REPO), null);
});

test('isBranchGone: a branch missing from the branch list counts as merged', () => {
  const api = loadApi();
  api.prCache[REPO] = {};
  api.allRunsByRepo[REPO] = { runsByWf: {}, activeBranches: new Set(['main', 'feature-a']) };

  assert.equal(api.isBranchGone(REPO, 'feature-a'), false);
  assert.equal(api.isBranchGone(REPO, 'feature-deleted'), true);
});

test('isBranchGone: an open PR means not merged, even if the branch list lacks it', () => {
  const api = loadApi();
  // e.g. a PR waiting on auto-merge whose branch wasn't in the list we got
  api.prCache[REPO] = { 'feature-automerge': { number: 736, auto_merge: { enabled: true } } };
  api.allRunsByRepo[REPO] = { runsByWf: {}, activeBranches: new Set(['main']) };

  assert.equal(api.isBranchGone(REPO, 'feature-automerge'), false);
});

test('isBranchGone: with no branch list, nothing is claimed as merged', () => {
  const api = loadApi();
  api.prCache[REPO] = {};
  api.allRunsByRepo[REPO] = { runsByWf: {}, activeBranches: null };

  assert.equal(api.isBranchGone(REPO, 'feature-a'), false);
});
