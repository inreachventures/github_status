// GitHub API + merge/automerge logic, split out of index.html so it can be
// unit tested with plain `require()` (see test/). Loaded via <script src>
// before the main inline script — classic <script> tags in one document
// share a single global scope, so these stay ordinary globals for the rest
// of the app exactly as if this were still inline.

// { [repo]: { [branch]: pr | null } }
let prCache = {};
// { [repo]: { runsByWf: { [wfName]: [run,...] }, activeBranches: Set } }
let allRunsByRepo = {};
// { [repo]: string } — default branch name
let repoDefaultBranch = {};

function getToken() { return localStorage.getItem('gh_token') || ''; }
function getOrg()   { return localStorage.getItem('gh_org') || ''; }

async function ghFetch(path) {
  const res = await fetch(`https://api.github.com${path}`, {
    headers: { Authorization: `Bearer ${getToken()}`, Accept: 'application/vnd.github+json' }
  });
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

// Lazy PR fetch for a specific branch — only called when user clicks Merge/AUTO
async function fetchPRForBranch(repo, branch) {
  const org = getOrg();
  const data = await ghFetch(
    `/repos/${org}/${repo}/pulls?state=open&head=${encodeURIComponent(org)}:${encodeURIComponent(branch)}&per_page=1`
  );
  return data[0] || null;
}

async function createPRForBranch(repo, branch) {
  const org = getOrg();
  const latestRun = Object.values(allRunsByRepo[repo]?.runsByWf || {})
    .flatMap(runs => runs)
    .filter(r => r.head_branch === branch)
    .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))[0];
  const title = latestRun?.display_title || latestRun?.head_commit?.message?.split('\n')[0] || branch;
  const base  = repoDefaultBranch[repo] || 'main';

  const res = await fetch(`https://api.github.com/repos/${org}/${repo}/pulls`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
    body: JSON.stringify({ title, head: branch, base, body: '' }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.message || res.status);
  }
  const pr = await res.json();
  if (!prCache[repo]) prCache[repo] = {};
  prCache[repo][branch] = pr;
  return pr;
}

async function setPRAutoMerge(pr, enabling) {
  const query = enabling
    ? `mutation($id:ID!){enablePullRequestAutoMerge(input:{pullRequestId:$id,mergeMethod:SQUASH}){pullRequest{number}}}`
    : `mutation($id:ID!){disablePullRequestAutoMerge(input:{pullRequestId:$id}){pullRequest{number}}}`;

  const res = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ query, variables: { id: pr.node_id } }),
  });
  const json = await res.json();
  if (json.errors?.length) throw new Error(json.errors[0].message);
}

async function mergeBranch(repo, branch, btn) {
  btn.disabled    = true;
  btn.textContent = '…';
  try {
    let pr = prCache[repo]?.[branch] ?? await fetchPRForBranch(repo, branch);

    // No open PR yet — create one so there's something to merge/automerge.
    if (!pr) {
      btn.textContent = 'Creating PR…';
      pr = await createPRForBranch(repo, branch);
    }

    const res = await fetch(
      `https://api.github.com/repos/${getOrg()}/${repo}/pulls/${pr.number}/merge`,
      {
        method: 'PUT',
        headers: { Authorization: `Bearer ${getToken()}`, 'Content-Type': 'application/json', Accept: 'application/vnd.github+json' },
        body: JSON.stringify({ merge_method: 'squash' }),
      }
    );

    if (res.ok) {
      btn.className   = 'merge-btn merged';
      btn.textContent = 'Merged ✓';
      btn.disabled    = true;
      return;
    }

    const body = await res.json().catch(() => ({}));

    // 405 = not mergeable right now (branch protection: required reviews/checks).
    // Fall back to GitHub's native auto-merge so it lands as soon as those pass.
    if (res.status === 405) {
      await setPRAutoMerge(pr, true);
      prCache[repo][branch] = { ...pr, auto_merge: { enabled: true } };
      btn.className   = 'merge-btn queued';
      btn.textContent = 'Queued ✓';
      btn.title       = 'Branch protection blocked a direct merge — auto-merge enabled on the PR instead';
      btn.disabled    = true;
      return;
    }

    throw new Error(body.message || res.status);
  } catch(e) {
    btn.disabled    = false;
    btn.className   = 'merge-btn error';
    btn.textContent = `✕ ${e.message}`;
    btn.title       = e.message;
    setTimeout(() => {
      btn.className   = 'merge-btn';
      btn.textContent = 'Merge';
    }, 5000);
  }
}

async function toggleAutoMergeBranch(repo, branch, btn) {
  btn.disabled = true;

  try {
    let pr = prCache[repo]?.[branch] ?? null;

    // No open PR — create one first
    if (!pr) {
      btn.className   = 'automerge-btn am-creating';
      btn.textContent = 'Creating PR…';
      pr = await createPRForBranch(repo, branch);
    }

    // Toggle automerge on the PR
    const enabling = pr.auto_merge == null;
    await setPRAutoMerge(pr, enabling);

    // Update local cache to reflect new state
    prCache[repo][branch] = { ...pr, auto_merge: enabling ? { enabled: true } : null };

    btn.className   = enabling ? 'automerge-btn am-on' : 'automerge-btn am-off';
    btn.textContent = enabling ? 'Auto Merge ✓' : 'Auto Merge';
    btn.title       = enabling ? 'Automerge enabled — click to disable' : 'Enable automerge (creates PR if needed)';
  } catch(e) {
    btn.className   = 'automerge-btn am-off';
    btn.textContent = 'Auto Merge';
    btn.title       = `Error: ${e.message}`;
  } finally {
    btn.disabled = false;
  }
}

// Node (tests) — browser <script src> just leaves these as globals.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    prCache, allRunsByRepo, repoDefaultBranch,
    getToken, getOrg, ghFetch, fetchPRForBranch,
    createPRForBranch, setPRAutoMerge, mergeBranch, toggleAutoMergeBranch,
  };
}
