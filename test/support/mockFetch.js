'use strict';

// Minimal fetch mock: routes are tried in order, first match wins. Records
// every call so tests can assert on what was (or wasn't) requested.
function mockFetch(routes) {
  const calls = [];
  global.fetch = async (url, opts = {}) => {
    calls.push({ url, opts });
    const route = routes.find(r => r.match(url, opts));
    if (!route) throw new Error(`Unmocked fetch: ${opts.method || 'GET'} ${url}`);
    const { status = 200, json = {} } = route.respond(url, opts);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => json,
    };
  };
  return calls;
}

function loadApi({ token = 'test-token', org = 'acme-org' } = {}) {
  const apiPath = require.resolve('../../github-api.js');
  delete require.cache[apiPath];
  const store = { gh_token: token, gh_org: org };
  global.localStorage = { getItem: k => store[k] ?? null };
  return require(apiPath);
}

module.exports = { mockFetch, loadApi };
