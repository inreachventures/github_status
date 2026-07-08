'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mockFetch, loadApi } = require('./support/mockFetch');

const prOpen = require('./fixtures/pr-open.json');
const prOpenAutoMergeOn = require('./fixtures/pr-open-automerge-on.json');
const autoMergeEnabled = require('./fixtures/graphql-enable-automerge.json');
const autoMergeDisabled = require('./fixtures/graphql-disable-automerge.json');

const REPO = 'example-repo';
const BRANCH = 'feature-branch';

function makeButton() {
  return { disabled: false, textContent: '', className: '', title: '' };
}

test('toggleAutoMergeBranch: enables automerge on a PR that already exists on GitHub but isn\'t in the local cache yet (fetches it instead of creating a duplicate)', async () => {
  const api = loadApi();
  // Mimics a repo whose PR list was already loaded (prCache[repo] exists)
  // but this particular branch's PR isn't cached — the bulk load may have
  // run before the PR was opened, or missed it for any other reason.
  api.prCache[REPO] = {};

  const calls = mockFetch([
    {
      // fetchPRForBranch fallback lookup — an open PR already exists
      match: (url, opts) => url.includes('/pulls?state=open') && (!opts.method || opts.method === 'GET'),
      respond: () => ({ status: 200, json: [prOpen] }),
    },
    {
      match: (url, opts) => url.endsWith('/graphql') && opts.method === 'POST',
      respond: (url, opts) => {
        const body = JSON.parse(opts.body);
        assert.match(body.query, /enablePullRequestAutoMerge/);
        assert.equal(body.variables.id, prOpen.node_id);
        return { status: 200, json: autoMergeEnabled };
      },
    },
  ]);

  const btn = makeButton();
  await api.toggleAutoMergeBranch(REPO, BRANCH, btn);

  const createCalls = calls.filter(c => c.opts.method === 'POST' && c.url.endsWith(`/repos/acme-org/${REPO}/pulls`));
  assert.equal(createCalls.length, 0, 'an existing PR must not be re-created');

  const graphqlCalls = calls.filter(c => c.url.endsWith('/graphql'));
  assert.equal(graphqlCalls.length, 1, 'automerge should be enabled exactly once');

  assert.equal(btn.className, 'automerge-btn am-on');
  assert.equal(btn.textContent, 'Auto Merge ✓');
  assert.equal(btn.disabled, false);
  assert.ok(api.prCache[REPO][BRANCH].auto_merge, 'auto_merge should be recorded in prCache');
});

test('toggleAutoMergeBranch: disables automerge on an existing PR that is already cached', async () => {
  const api = loadApi();
  api.prCache[REPO] = { [BRANCH]: prOpenAutoMergeOn };

  const calls = mockFetch([
    {
      match: (url, opts) => url.endsWith('/graphql') && opts.method === 'POST',
      respond: (url, opts) => {
        const body = JSON.parse(opts.body);
        assert.match(body.query, /disablePullRequestAutoMerge/);
        assert.equal(body.variables.id, prOpenAutoMergeOn.node_id);
        return { status: 200, json: autoMergeDisabled };
      },
    },
  ]);

  const btn = makeButton();
  await api.toggleAutoMergeBranch(REPO, BRANCH, btn);

  const prLookupCalls = calls.filter(c => c.url.includes('/pulls?state=open'));
  assert.equal(prLookupCalls.length, 0, 'an already-cached PR should not be re-fetched');

  const createCalls = calls.filter(c => c.opts.method === 'POST' && c.url.endsWith(`/repos/acme-org/${REPO}/pulls`));
  assert.equal(createCalls.length, 0, 'an existing PR must not be re-created');

  assert.equal(btn.className, 'automerge-btn am-off');
  assert.equal(btn.textContent, 'Auto Merge');
  assert.equal(api.prCache[REPO][BRANCH].auto_merge, null, 'auto_merge should be cleared in prCache');
});

test('toggleAutoMergeBranch: creates a new PR when none exists yet, then enables automerge', async () => {
  const api = loadApi();
  api.prCache[REPO] = {};
  api.allRunsByRepo[REPO] = { runsByWf: {} };

  const calls = mockFetch([
    {
      // fetchPRForBranch — no open PR yet
      match: (url, opts) => url.includes('/pulls?state=open') && (!opts.method || opts.method === 'GET'),
      respond: () => ({ status: 200, json: [] }),
    },
    {
      // createPRForBranch
      match: (url, opts) => url.endsWith(`/repos/acme-org/${REPO}/pulls`) && opts.method === 'POST',
      respond: () => ({ status: 201, json: prOpen }),
    },
    {
      match: (url, opts) => url.endsWith('/graphql') && opts.method === 'POST',
      respond: (url, opts) => {
        const body = JSON.parse(opts.body);
        assert.match(body.query, /enablePullRequestAutoMerge/);
        assert.equal(body.variables.id, prOpen.node_id);
        return { status: 200, json: autoMergeEnabled };
      },
    },
  ]);

  const btn = makeButton();
  await api.toggleAutoMergeBranch(REPO, BRANCH, btn);

  const createCalls = calls.filter(c => c.opts.method === 'POST' && c.url.endsWith(`/repos/acme-org/${REPO}/pulls`));
  assert.equal(createCalls.length, 1, 'a PR should be created when none exists');

  const graphqlCalls = calls.filter(c => c.url.endsWith('/graphql'));
  assert.equal(graphqlCalls.length, 1, 'automerge should be enabled exactly once');

  assert.equal(btn.className, 'automerge-btn am-on');
  assert.equal(btn.textContent, 'Auto Merge ✓');
  assert.ok(api.prCache[REPO][BRANCH].auto_merge, 'auto_merge should be recorded in prCache');
});
