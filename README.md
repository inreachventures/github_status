# GitHub CI Status

A minimal PWA that shows the last 5 GitHub Actions workflow runs for any set of repos, with auto-refresh. Can be installed as a standalone desktop app via Chrome.

## Quickest option — use the deployed app

Open **[github.inreachventures.com](https://github.inreachventures.com)** — no install, no server needed.

You'll be asked for a GitHub Personal Access Token on first run. [Create one here](https://github.com/settings/tokens/new?description=github_status%20dashboard&scopes=repo,workflow,read:org) with `repo`, `workflow`, and `read:org` scopes. Your token is stored only in your browser's local storage — nothing is sent to any server.

## Install as a desktop app (recommended)

Open the app in Chrome, then click the install icon (⊕) in the address bar → **Install**.

![Install app](install_app_image.png)

## Run it yourself (local Python server)

If you'd rather host it yourself:

```bash
git clone https://github.com/inreachventures/github_status
cd github_status
python3 -m http.server 8765
```

Then open `http://localhost:8765` in your browser.

## Features

- Any number of repos across any GitHub org — displayed in a max-3-column grid
- Auto-refresh every 10 seconds (configurable from 10s to 2m)
- Mood indicator based on overall build health
- Click any run to open it in GitHub
- Installable as a standalone macOS/Windows/Linux app via Chrome PWA