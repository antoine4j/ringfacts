# Sandboxed autonomy — spec for later

Status: **idea, parked** (2026-08-08). Anton is sitting on it; the local scheduled
routine with manual approvals continues meanwhile. Nothing here is built.

## Goal

Run the self-improvement routine (wake on schedule → review how the program ran →
improve code/design → commit → go dormant) in an environment that stays harmless
**even if fully compromised** by prompt injection. Ephemeral machine is fine; the
git repo is the only thing that must survive between runs.

## Core principle: the walls aren't the security — the pockets are

A sandbox limits where the agent can reach, but the real blast radius is whatever
credentials it holds. Design = choose the pockets:

| Credential | Give the routine? | Scope |
|---|---|---|
| Anthropic auth | yes (it has to think) | hard spend cap at console.anthropic.com (~$10) makes worst-case abuse a rounding error |
| GCP | yes, but NOT Anton's `gcloud auth` | dedicated service account: read logs, execute `fighterbot-hunter`, deploy that one job. No resource creation, no API enabling, no billing powers |
| Neon | yes | read-only role — analysis needs SELECT, not DROP |
| Telegram bot token | **no, never** | reviewing/improving code requires messaging nobody; the sandbox physically cannot spam the group |

## Three ways to get the sandbox (weakest to strongest fit)

1. **Local Docker.** Claude Code CLI runs headless (`claude -p "..."`) in a
   container; subscription auth via a long-lived token (`claude setup-token`)
   injected as env. Anthropic publishes a reference devcontainer with a
   **network egress allowlist** (container can only reach named domains:
   Anthropic, GitHub, GCP APIs) — closes the exfiltration path entirely.
   Downside: still Anton's laptop, still needs the laptop awake.
2. **Claude cloud sessions.** Anthropic's own VM, repo-only checkout, included
   in the subscription. Already the safest place the bot runs today. Downside:
   session-shaped, not cron-shaped.
3. **GitHub Actions on cron — the recommended destination.** GitHub spins up an
   ephemeral VM per run, checks out the repo, runs Claude Code, commits results,
   evaporates. Repo persistence = GitHub itself; laptop can be closed. Same
   prerequisite as the auto-deploy TODO (push to GitHub), two payoffs.

## GCP spending: there is no hard cap — design around it

GCP budgets are **alerts only** (a budget→Pub/Sub→Cloud Function billing kill
switch exists but is DIY and drastic). The structural substitute: the routine's
service account simply **lacks every permission that costs money**. Spending
requires powers; don't mount the powers. Anton's own account keeps them.
`max-instances=1` caps what already exists.

## Harm inventory if fully compromised (the acceptable-worst-case list)

- Garbage commits — git history survives; route the routine's commits through a
  branch/PR so trash never touches `main` without a human glance.
- Wasted Anthropic dollars — capped.
- A redeployed hunter job — rolled back with one command from setup.sh.

That's the whole list. No secrets to steal (none on the machine), nowhere to
send them (egress allowlist), no group to spam (no bot token), nothing to bill.

## Build order (when Anton says go)

1. Push repo to GitHub (also unlocks the auto-deploy TODO and phone-started
   cloud sessions reading committed `.claude/settings.json`).
2. Create scoped GCP service account + key; create read-only Neon role.
3. GitHub Actions workflow: cron schedule → checkout → Claude Code with the
   three pocket credentials as repo secrets → commit to branch / open PR.
4. Retire (or keep as backup) the local scheduled task.
