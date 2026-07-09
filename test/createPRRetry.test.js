'use strict';

// Covers the "PR creation races GitHub's read path" scenarios:
//   B. createPRForBranch fails because a PR already exists (our prior
//      list-fetch was a false negative) — retry-fetch should find it and
//      use it instead of surfacing a scary error.
//   C. createPRForBranch fails for a real reason (no diff, deleted branch,
//      etc.) — retry-fetch still finds nothing, so the original error must
//      still surface, not be swallowed.
// Scenario A (cache miss but PR exists) is covered by mergeBranch.test.js
// and toggleAutoMerge.test.js.

const test = require('node:test');
const assert = require('node:assert/strict');
const { mockFetch, loadApi } = require('./support/mockFetch');

const prOpen = require('./fixtures/pr-open.json');
const autoMergeEnabled = require('./fixtures/graphql-enable-automerge.json');

const REPO = 'example-repo';
const BRANCH = 'feature-branch';

function makeButton() {
  return { disabled: false, textContent: '', className: '', title: '' };
}

test('retryConfig.prCreateRetryDelayMs defaults to 5 seconds in production', () => {
  const api = loadApi();
  assert.equal(api.retryConfig.prCreateRetryDelayMs, 5000);
});

test('createPRForBranch: falls back to the existing PR when creation fails with "already exists" (GitHub list read lagging behind)', async () => {
  const api = loadApi();
  api.retryConfig.prCreateRetryDelayMs = 0;
  api.allRunsByRepo[REPO] = { runsByWf: {} };

  const calls = mockFetch([
    {
      match: (url, opts) => url.endsWith(`/repos/acme-org/${REPO}/pulls`) && opts.method === 'POST',
      respond: () => ({
        status: 422,
        json: { message: `A pull request already exists for acme-org:${BRANCH}.` },
      }),
    },
    {
      // retry lookup after the create failure — the PR is now visible
      match: (url, opts) => url.includes('/pulls?state=open') && (!opts.method || opts.method === 'GET'),
      respond: () => ({ status: 200, json: [prOpen] }),
    },
  ]);

  const pr = await api.createPRForBranch(REPO, BRANCH);

  assert.deepEqual(pr, prOpen);
  assert.equal(api.prCache[REPO][BRANCH], pr, 'the recovered PR should be cached');

  const createCalls = calls.filter(c => c.opts.method === 'POST');
  assert.equal(createCalls.length, 1, 'should only attempt creation once, not loop');
  const lookupCalls = calls.filter(c => c.url.includes('/pulls?state=open'));
  assert.equal(lookupCalls.length, 1, 'exactly one retry lookup after the failed create');
});

test('createPRForBranch: surfaces the original error when no PR exists even after retrying', async () => {
  const api = loadApi();
  api.retryConfig.prCreateRetryDelayMs = 0;
  api.allRunsByRepo[REPO] = { runsByWf: {} };

  mockFetch([
    {
      match: (url, opts) => url.endsWith(`/repos/acme-org/${REPO}/pulls`) && opts.method === 'POST',
      respond: () => ({
        status: 422,
        json: { message: 'No commits between main and feature-branch' },
      }),
    },
    {
      // retry lookup — still nothing, this was a genuine failure
      match: (url, opts) => url.includes('/pulls?state=open') && (!opts.method || opts.method === 'GET'),
      respond: () => ({ status: 200, json: [] }),
    },
  ]);

  await assert.rejects(
    () => api.createPRForBranch(REPO, BRANCH),
    { message: 'No commits between main and feature-branch' }
  );

  assert.equal(api.prCache[REPO]?.[BRANCH], undefined, 'nothing should be cached on a genuine failure');
});

test('createPRForBranch: surfaces the original error when the retry lookup itself fails', async () => {
  const api = loadApi();
  api.retryConfig.prCreateRetryDelayMs = 0;
  api.allRunsByRepo[REPO] = { runsByWf: {} };

  mockFetch([
    {
      match: (url, opts) => url.endsWith(`/repos/acme-org/${REPO}/pulls`) && opts.method === 'POST',
      respond: () => ({ status: 422, json: { message: 'No commits between main and feature-branch' } }),
    },
    {
      match: (url, opts) => url.includes('/pulls?state=open') && (!opts.method || opts.method === 'GET'),
      respond: () => ({ status: 500, json: {} }),
    },
  ]);

  await assert.rejects(
    () => api.createPRForBranch(REPO, BRANCH),
    { message: 'No commits between main and feature-branch' },
    'a broken retry lookup must not mask the real creation error'
  );
});

test('mergeBranch: recovers via retry-fetch when PR creation races an already-open PR, then merges it', async () => {
  const api = loadApi();
  api.retryConfig.prCreateRetryDelayMs = 0;
  api.allRunsByRepo[REPO] = { runsByWf: {} };

  let listCallCount = 0;
  const calls = mockFetch([
    {
      match: (url, opts) => url.includes('/pulls?state=open') && (!opts.method || opts.method === 'GET'),
      respond: () => {
        listCallCount += 1;
        // 1st call: mergeBranch's initial cache-miss lookup finds nothing.
        // 2nd call: createPRForBranch's retry lookup finds the real PR.
        return { status: 200, json: listCallCount === 1 ? [] : [prOpen] };
      },
    },
    {
      match: (url, opts) => url.endsWith(`/repos/acme-org/${REPO}/pulls`) && opts.method === 'POST',
      respond: () => ({
        status: 422,
        json: { message: `A pull request already exists for acme-org:${BRANCH}.` },
      }),
    },
    {
      match: (url, opts) => url.includes(`/pulls/${prOpen.number}/merge`) && opts.method === 'PUT',
      respond: () => ({ status: 200, json: { merged: true, sha: 'deadbeef' } }),
    },
  ]);

  const btn = makeButton();
  await api.mergeBranch(REPO, BRANCH, btn);

  assert.equal(btn.className, 'merge-btn merged');
  assert.equal(btn.textContent, 'Merged ✓');

  const createCalls = calls.filter(c => c.opts.method === 'POST');
  assert.equal(createCalls.length, 1, 'should not loop on creation attempts');
});

test('toggleAutoMergeBranch: recovers via retry-fetch when PR creation races an already-open PR, then enables automerge', async () => {
  const api = loadApi();
  api.retryConfig.prCreateRetryDelayMs = 0;
  api.allRunsByRepo[REPO] = { runsByWf: {} };

  let listCallCount = 0;
  const calls = mockFetch([
    {
      match: (url, opts) => url.includes('/pulls?state=open') && (!opts.method || opts.method === 'GET'),
      respond: () => {
        listCallCount += 1;
        return { status: 200, json: listCallCount === 1 ? [] : [prOpen] };
      },
    },
    {
      match: (url, opts) => url.endsWith(`/repos/acme-org/${REPO}/pulls`) && opts.method === 'POST',
      respond: () => ({
        status: 422,
        json: { message: `A pull request already exists for acme-org:${BRANCH}.` },
      }),
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

  assert.equal(btn.className, 'automerge-btn am-on');
  assert.equal(btn.textContent, 'Auto Merge ✓');

  const createCalls = calls.filter(c => c.opts.method === 'POST' && c.url.endsWith(`/repos/acme-org/${REPO}/pulls`));
  assert.equal(createCalls.length, 1, 'should not loop on creation attempts');
});
