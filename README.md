# GitHub CI Status

A minimal PWA that shows the last 5 GitHub Actions workflow runs for any set of repos, with auto-refresh. Can be installed as a standalone desktop app via Chrome.

## Features

- Any number of repos across any GitHub org — displayed in a max-3-column grid
- Auto-refresh every 10 seconds (configurable from 10s to 2m)
- Mood indicator based on overall build health
- Click any run to open it in GitHub
- Installable as a standalone macOS/Windows/Linux app via Chrome PWA

## Usage

1. **Open `index.html`** directly in Chrome (double-click or `File > Open`).

2. **The settings modal opens automatically** on first run. Enter:
   - A GitHub Personal Access Token ([create one here](https://github.com/settings/tokens)) with `repo` and `workflow` scopes
   - Your GitHub organization name or username
   - One or more repos and their workflow names (must match exactly as shown in GitHub Actions)

3. Click **Save & Refresh** — cards appear immediately and auto-refresh every 10 seconds.

Settings are saved in `localStorage` and persist across browser restarts. Click ⚙ at any time to update them.

> **No server required.** The app runs entirely in the browser and calls the GitHub API directly.

## Install as a desktop app (optional)

To pin as a standalone macOS/Windows app via Chrome PWA, you need to serve it over HTTP first:

```bash
python3 -m http.server 8765
```

Open `http://localhost:8765` in Chrome, then click the install icon (⊕) in the address bar → **Install**. After that, the app runs standalone and the server can be stopped.

## Layout

Repos are displayed in a responsive grid with a maximum of 3 columns:

| Repos | Rows |
|-------|------|
| 1–3   | 1    |
| 4–6   | 2    |
| 7–9   | 3    |
| …     | …    |

## Reset settings

Open DevTools → Application → Local Storage → delete `gh_token`, `gh_org`, `gh_repos`.

## Files

```
github_status/
  index.html   — single-file app (inline CSS + JS, no build step, no dependencies)
  manifest.json — PWA metadata
  sw.js         — service worker (enables PWA install)
  icon.svg      — app icon
```
