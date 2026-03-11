# standup-bot

A lightweight macOS background service that polls GitHub and Jira, stores your activity in a local SQLite database, and gives you a clean standup summary from the terminal.

```
$ standup
=== STANDUP — Wednesday, March 11, 2026 ===
  (since yesterday)

Yesterday:
  Jira:
    [Tue 2:14pm] [PROJ-42] In Development → Peer Review — Add bulk export feature
  GitHub:
    [Tue 4:30pm] Pushed 3 commit(s) to feature/bulk-export in my-repo "wire up CSV download"
    [Tue 4:31pm] Opened PR #88 in my-repo: Add bulk export feature

Today:
  • [Peer Review] [PROJ-42] {Sprint 14} — Add bulk export feature

Blockers:
  None
```

---

## Requirements

- **macOS** (uses launchd for autostart)
- **Node.js v20** via [nvm](https://github.com/nvm-sh/nvm)
- A **GitHub personal access token**
- A **Jira Cloud API token**

---

## Step 1 — GitHub Personal Access Token

1. Go to **GitHub → Settings → Developer settings → Personal access tokens → Tokens (classic)**
   - Direct link: `https://github.com/settings/tokens`
2. Click **Generate new token (classic)**
3. Give it a name (e.g. `standup-bot`)
4. Set an expiration (90 days or longer)
5. Check these scopes:
   - `repo` — full repo access (required to read private repo events, PRs, and commits)
   - `read:user` — read your public profile (required to identify your events)
6. Click **Generate token** and copy it immediately — it won't be shown again

Paste this token into `config.json` as `github.token`.

---

## Step 2 — Jira API Token

1. Go to **Atlassian Account → Security → API tokens**
   - Direct link: `https://id.atlassian.com/manage-profile/security/api-tokens`
2. Click **Create API token**
3. Give it a label (e.g. `standup-bot`) and click **Create**
4. Copy the token — it won't be shown again

> **Microsoft SSO users:** SSO only applies to browser login. API tokens work independently via Basic auth and do not require any special setup.

Paste the token into `config.json` as `jira.apiToken`, alongside your Jira domain (e.g. `yourcompany.atlassian.net`) and your Atlassian account email.

---

## Step 3 — Find Your Jira Custom Field IDs

Jira's story points and sprint fields use instance-specific IDs. You need to find yours.

Run this command (replace the placeholders):

```bash
curl -u YOUR_EMAIL:YOUR_API_TOKEN \
  "https://YOUR_DOMAIN/rest/api/3/field" \
  | python3 -m json.tool \
  | grep -B1 -A3 '"story\|sprint"'
```

Look for entries like:
- `"customfield_10106"` — story points (often labeled "Story Points" or "Story point estimate")
- `"customfield_10020"` — sprint

Alternatively, in your browser: open a Jira ticket, right-click a story points or sprint field, and choose **Inspect** to find the field ID in the element's attributes.

Set these in `config.json` under `jira.customFields`.

---

## Step 4 — Configure

Copy the example config and fill it in:

```bash
mkdir -p ~/.standup-bot
cp config.example.json ~/.standup-bot/config.json
nano ~/.standup-bot/config.json
```

```json
{
  "github": {
    "token": "ghp_...",
    "username": "your-github-username"
  },
  "jira": {
    "domain": "yourcompany.atlassian.net",
    "email": "you@yourcompany.com",
    "apiToken": "ATATT3x...",
    "project": [],
    "customFields": {
      "storyPoints": "customfield_10106",
      "sprint": "customfield_10020"
    },
    "statuses": {
      "todo": ["To Do", "To-Do", "Open"],
      "inDevelopment": ["In Development", "In Progress", "In-Development"],
      "qaTestFailed": ["QA Test Failed"],
      "peerReview": ["Peer Review"],
      "readyForQA": ["Ready for QA", "QA In Progress"],
      "done": ["Done", "Closed", "Resolved"]
    }
  },
  "polling": {
    "intervalMinutes": 10
  }
}
```

**Notes:**
- `project` can be an empty array `[]` (tracks all projects) or a list of keys: `["PROJ", "INFRA"]`
- `statuses` should match the exact status names in your Jira instance — check a ticket's status dropdown if unsure
- `customFields` defaults match common Jira Cloud configurations; update them if story points or sprint aren't showing up

---

## Step 5 — Install

Make sure Node v20 is active:

```bash
nvm use 20
```

Then run the installer from the project root:

```bash
bash scripts/install.sh
```

The installer will:
1. Run `npm install` and compile TypeScript
2. Link the `standup` command globally via `npm link`
3. Copy `config.json` to `~/.standup-bot/config.json` if it doesn't exist yet
4. Write and load a launchd agent (`com.standup-bot.daemon`) that starts the polling daemon on login

After install, edit your config if you haven't already:

```bash
nano ~/.standup-bot/config.json
```

Then restart the daemon to pick up your credentials:

```bash
launchctl stop com.standup-bot.daemon && launchctl start com.standup-bot.daemon
```

Check that it's running:

```bash
tail -f ~/.standup-bot/daemon.log
```

You should see `--- Poll cycle complete ---` within a few seconds.

---

## Usage

```bash
standup                  # What you did yesterday (or since Thursday if today is Monday)
standup --fakeit         # Same, but phrased impressively
standup --days 4         # Look back N days instead of the default
standup --fakeit --days 4

standup todo             # All tickets assigned to you that are active (not Done)
standup prs              # Open PRs with CI status and matching Jira tickets
standup help             # Show all commands
```

---

## File Locations

| Path | Description |
|---|---|
| `~/.standup-bot/config.json` | Your credentials and settings |
| `~/.standup-bot/standup.db` | Local SQLite database |
| `~/.standup-bot/daemon.log` | Daemon output log |
| `~/.standup-bot/daemon-error.log` | Daemon error log |
| `~/Library/LaunchAgents/com.standup-bot.daemon.plist` | launchd agent definition |

---

## Daemon Management

```bash
# Stop and restart
launchctl stop com.standup-bot.daemon && launchctl start com.standup-bot.daemon

# View logs live
tail -f ~/.standup-bot/daemon.log

# Check if running
launchctl list | grep standup-bot

# Uninstall daemon (keeps config and DB)
launchctl unload ~/Library/LaunchAgents/com.standup-bot.daemon.plist
```

---

## How Blockers Work

The **Blockers** section in `standup` output surfaces two conditions automatically:

- **QA Test Failed** — any ticket in a status listed under `jira.statuses.qaTestFailed` in your config
- **Stalled Peer Review** — any ticket in a `peerReview` status that hasn't been updated in more than 3 days

No manual input required — these are derived from your live Jira ticket state.
