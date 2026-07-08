'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { mockFetch, loadApi } = require('./support/mockFetch');

const prOpen = require('./fixtures/pr-open.json');
const mergeBlocked = require('./fixtures/merge-blocked-required-status-check.json');
const autoMergeEnabled = require('./fixtures/graphql-enable-automerge.json');

const REPO = 'example-repo';
const BRANCH = 'feature-branch';

function makeButton() {
  return { disabled: false, textContent: '', className: '', title: '' };
}

test('mergeBranch: falls back to PR + auto-merge when GitHub blocks a direct merge (405, required status checks)', async () => {
  const api = loadApi();

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
      // mergeBranch's direct merge attempt — blocked by branch protection
      match: (url, opts) => url.includes(`/pulls/${prOpen.number}/merge`) && opts.method === 'PUT',
      respond: () => ({ status: 405, json: mergeBlocked }),
    },
    {
      // setPRAutoMerge fallback
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
  await api.mergeBranch(REPO, BRANCH, btn);

  assert.equal(btn.className, 'merge-btn queued');
  assert.equal(btn.textContent, 'Queued ✓');
  assert.equal(btn.disabled, true);
  assert.match(btn.title, /branch protection/i);

  assert.ok(api.prCache[REPO][BRANCH].auto_merge, 'auto_merge should be recorded in prCache');

  const graphqlCalls = calls.filter(c => c.url.endsWith('/graphql'));
  assert.equal(graphqlCalls.length, 1, 'auto-merge should be enabled exactly once');
});

test('mergeBranch: surfaces a genuine merge error (422) as an error, without silently enabling auto-merge', async () => {
  const api = loadApi();
  api.prCache[REPO] = { [BRANCH]: prOpen };

  const calls = mockFetch([
    {
      match: (url, opts) => url.includes(`/pulls/${prOpen.number}/merge`) && opts.method === 'PUT',
      respond: () => ({ status: 422, json: { message: 'Pull Request is not mergeable' } }),
    },
  ]);

  const btn = makeButton();
  await api.mergeBranch(REPO, BRANCH, btn);

  assert.equal(btn.className, 'merge-btn error');
  assert.equal(btn.textContent, '✕ Pull Request is not mergeable');

  const graphqlCalls = calls.filter(c => c.url.endsWith('/graphql'));
  assert.equal(graphqlCalls.length, 0, 'a non-405 error must not trigger the auto-merge fallback');
});

test('mergeBranch: merges directly when GitHub allows it (200)', async () => {
  const api = loadApi();
  api.prCache[REPO] = { [BRANCH]: prOpen };

  mockFetch([
    {
      match: (url, opts) => url.includes(`/pulls/${prOpen.number}/merge`) && opts.method === 'PUT',
      respond: () => ({ status: 200, json: { merged: true, sha: 'deadbeef' } }),
    },
  ]);

  const btn = makeButton();
  await api.mergeBranch(REPO, BRANCH, btn);

  assert.equal(btn.className, 'merge-btn merged');
  assert.equal(btn.textContent, 'Merged ✓');
  assert.equal(btn.disabled, true);
});
