# FighterBot — Project Specification

## 1. Overview

FighterBot is a personal, conversational Telegram agent that tracks a small watchlist of MMA fighters and proactively delivers relevant career news to a private group chat shared by Anton and his friends. It replaces algorithm-driven scrolling (Instagram, news feeds) with a push-based, distraction-free news channel scoped to exactly the fighters the group cares about.

**Core motivation (the "why"):** Checking fighter news today means opening Instagram, getting pulled into adjacent recommended content, and losing time/attention. FighterBot inverts the model: news comes to the user, only for chosen fighters, with nothing adjacent attached.

**Secondary motivation:** This is a learning project for building a production-grade agentic system with real usage and real edge cases. Start as a single agent with tools; evolve into multi-agent orchestration only when real edge cases demand it.

**Budget constraint:** Effectively free. Acceptable costs: a personal domain (~$10–15/yr, already planned for portfolio use) and home electricity (~$3–7/mo measured for the chosen hardware). No paid hosting tiers.

---

## 2. Users & Usage Context

- **Users:** Anton + a small group of friends (Ukrainian MMA fans). Single private Telegram group chat.
- **Not** a public product at MVP stage. No multi-tenant support, no onboarding flows, no auth beyond Telegram group membership.
- **Initial watchlist (seed data):**
  - Fighter A — upcoming fights and career news
  - Fighter B — upcoming fights and career news
  - Fighter C — recovery progress, interviews, return-to-fight news

## 3. Functional Requirements

### 3.1 Proactive news delivery (the "hunter")
- On a schedule (cron), discover news about watchlist fighters from configured sources.
- **Scope of "news" is broader than fight announcements.** Event types include: fight scheduled, fight result, injury, recovery updates, notable interviews, callouts, general significant career news. FighterBot is a per-fighter career tracker, not just a fight alarm.
- **Relevance judgment is the core AI feature.** An LLM decides "is this worth interrupting the group for?" with a **tunable importance threshold**. Example calibration: Fighter C giving his first big interview after a loss → notify. Fighter B getting a fight scheduled → notify. Minor gym footage → probably not.
- **Deduplication:** never re-notify about news already delivered (requires persistent state of what was sent).

### 3.2 Rumor vs. confirmed tracking
- Sources are tiered by trust:
  - **High trust (= confirmed):** the fighter's own account/channel, official promotion sources (UFC website/accounts, etc.)
  - **Low trust (= rumor):** tracker/influencer accounts, aggregator pages
- **Rumors are a feature, not noise.** Deliver rumors immediately, clearly labeled ("Rumor — source: X, not confirmed"), because they build anticipation in the group. Then track the claim over time and post a follow-up when status changes ("Confirmed — fighter posted it himself"). This claim-lifecycle tracking (rumor → confirmed / debunked) is a key differentiator and a natural place for future multi-agent complexity.

### 3.3 Conversational follow-up (the "responder")
- Bot lives in the group chat and responds when tagged (@FighterBot).
- Users can follow up on any delivered news item, e.g. "Tell me more about this opponent. How does he stack up against our guy?"
- Requires conversation context/memory (who "him" refers to, which news item is being discussed). Memory implementation deferred — Mastra's built-in capabilities are the planned starting point.
- Responder must feel responsive → webhook-based delivery from Telegram (not polling).

### 3.4 Privacy within the group
- Bot must NOT read general group chatter. Only messages that tag the bot, replies to the bot's messages, and commands.
- Implementation: Telegram **privacy mode** (default for bots, verify/toggle via BotFather).

## 4. Architecture & Technology Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Agent framework | **Mastra** (TypeScript/Node) | User's choice; built for agent orchestration, tool use, conversation state |
| Start topology | **Single agent + tools** | Prove end-to-end value first; split into multiple agents only when edge cases force it. Anticipated future splits: source monitoring / trust-tagging / claim-lifecycle tracking / conversational Q&A |
| Chat platform | **Telegram bot** (via BotFather token) | Group already lives in Telegram |
| Message receipt | **Webhooks from day one** (not polling) | Conversational follow-ups must feel instant |
| Hosting | **Self-hosted on repurposed 2019 13" MacBook Pro** (Intel, 16GB RAM), wiped, running Docker | Free, no execution-time limits, no cron limits, always-on; solves both hunter and responder halves in one home. Measured cost ~$2.5–6.5/mo electricity at SF PG&E rates |
| Public reachability | **Cloudflare named tunnel** → subdomain of personal domain (e.g. `bot.antonfomin.com`) | Free tunnel; laptop dials out, so no router port-forwarding, no cert management; named tunnel keeps a stable HTTPS URL across reboots and IP changes (required so the Telegram webhook registration never breaks) |
| Domain | **antonfomin.com** (no dash), DNS on Cloudflare | Clean version available; root domain → Vercel portfolio site; free subdomain → tunnel. One purchase serves portfolio + bot + email |
| Scheduling | **Local cron on the laptop** (inside/alongside the Docker container) | No external scheduler needed once self-hosting; GitHub Actions fallback documented below |
| LLM access | Model called via API with tools (web search etc.) orchestrated by Mastra | Model has no built-in search; the app supplies tools and runs the loop |

### 4.1 Rejected / fallback options (keep for reference)
- **Vercel for the whole system:** rejected. Serverless execution-time limits conflict with multi-step agent loops; free cron limited to ~1/day. (Workaround considered: external GitHub Actions cron hitting a secret-protected Vercel URL — viable for the responder only, still blocked by execution limits for long agent runs.)
- **Railway / Render / Fly:** rejected for cost. Railway has no sustained free tier; Render free tier sleeps and can't run the always-on hunter reliably.
- **GitHub Actions as the hunter's home:** viable free fallback if the laptop route fails. Runners have full internet access, can run Node/Mastra for minutes, free on personal repos. Constraint: stateless — external state store required. It's a repurposing "hack" of CI infrastructure; acceptable but second choice.
- **Quick (unnamed) Cloudflare tunnel:** rejected — URL changes on every restart, breaking the Telegram webhook registration.

## 5. Data Sources (input pipeline)

Candidate source strategies, to be validated during build (Instagram is hostile to scraping — do not build on scraping Instagram directly):
1. **Instagram → email digest relay:** enable Instagram notification emails; agent reads the inbox. (Sidesteps scraping entirely.)
2. **Fighters'/trackers' Telegram channels** where they exist.
3. **MMA news sites** with clean HTML or feeds/APIs.
4. Web search as an agent tool for on-demand enrichment (opponent breakdowns, follow-up questions).

Each source is assigned a trust tier (see 3.2) in configuration.

## 6. State & Persistence

Persistent state required (survives restarts; lives on the laptop, e.g. SQLite or similar lightweight store):
- Fighter watchlist (name, aliases/spellings, tracked topics)
- Source list with trust tiers
- Delivered-news log (for dedup)
- Claim registry (rumor lifecycle: first seen, sources, current status, resolution)
- Conversation memory for follow-ups (via Mastra)
- Tunable relevance threshold setting

## 7. Security Requirements

- **Secrets** (Telegram bot token, LLM API key, tunnel credentials): environment variables / secret store only. Never committed to the repo.
- **Webhook authentication:** use Telegram's webhook **secret token** so the endpoint rejects any request not genuinely from Telegram. Do not rely on the subdomain being unknown — subdomain names are discoverable (certificate transparency logs, enumeration). Security through obscurity is a bonus, never the lock.
- **Minimal exposure:** only the tunnel provides ingress; no router ports opened; keep OS and dependencies updated.
- Bot reads only tagged messages (privacy mode) — see 3.4.

## 8. Reliability Requirements (home-server realities)

- Disable laptop sleep; prefer ethernet over Wi-Fi.
- Docker container(s) restart automatically on boot/crash (`restart: always` or equivalent).
- Cloudflare tunnel daemon launches on boot and auto-reconnects (named tunnel = same address after reconnect).
- Acceptable failure mode: hours of downtime are tolerable (hobby project), but the system must self-heal without manual intervention after power/network blips.

## 9. Build Sequence (agreed order: plumbing first, intelligence second)

1. **Delivery rail:** Telegram bot created via BotFather, added to the group, posts a hardcoded scheduled message. Laptop + Docker + named tunnel + webhook registered and verified end to end.
2. **One real source:** pipe raw items from the easiest source (likely the email-digest relay) into the chat. No filtering.
3. **Fighter filter:** apply the watchlist; only matching items get through.
4. **Relevance agent:** LLM scores each item against the tunable "worth interrupting for?" threshold.
5. **Rumor/confirmed layer:** trust-tier tagging + claim lifecycle tracking with follow-up posts on status change.
6. **Conversational follow-ups:** tagged-mention Q&A with context memory (Mastra), web search tool for enrichment.

Rationale for order: if the plumbing is flaky, no amount of content intelligence reaches the group; and once the rail exists, every intelligence improvement is instantly visible in the real chat (fast feedback loop).

## 10. Explicit Non-Goals (MVP)

- No prediction/betting game (group isn't competitive that way — validated and killed).
- No public/multi-tenant product, no monetization.
- No direct Instagram scraping.
- No multi-agent orchestration until a real edge case demands it.

## 11. LLM Cost Model & Cost-Control Design

**Willing to pay a few dollars/month for LLM API.** Everything else stays free.

Estimated monthly cost (token math, current pricing ~July 2026; cheap models like Claude Haiku 3.5 at ~$0.80/$4.00 per 1M in/out, Gemini Flash-Lite even less):

| Scenario | Setup | Approx cost/mo |
|---|---|---|
| Minimal | 3 fighters, few checks/day, shallow classification | ~$2 |
| Low | 3 fighters, ~hourly, shallow | ~$6–7 |
| Medium (naive deep) | 6 fighters, hourly, deep analysis on **every** item | ~$165 ⚠️ |
| High (naive deep) | 12 fighters, every 30 min, deep on every item | ~$1,000+ ⚠️ |
| Conversational follow-ups | ~2–30 questions/day (deep) | ~$1–18 |

**Key finding:** cost does NOT explode from frequency or fighter count — it explodes from **applying deep analysis blindly to every item on every run** (re-analyzing the same items repeatedly).

**Cost-control rule (mandatory design constraint): shallow-filter-before-deep.**
1. **Shallow pass (cheap):** quick classifier over candidate items — "is this new (past the fighter's timeline watermark) AND about a tracked fighter?" Cheap tokens only.
2. **Deep pass (expensive):** only items that survive the shallow filter AND are genuinely novel get full article text + web search + reasoning + summary.

Deduplication is therefore not just UX hygiene — **it is the primary cost control**. Budget target: **$5–10/mo indefinitely** as long as deep reasoning runs only on filtered, novel items.

**Open sub-decision:** final model choice (Haiku 3.5 / Haiku 4.5 / Gemini Flash-Lite) — pick per quality-vs-cost after MVP.

## 12. Per-Fighter Timeline & Importance Scoring

Two **distinct** judgments — do not conflate them:

- **Novelty (dedup):** "Have I already reported this?" Answered by the per-fighter timeline.
- **Importance (relevance):** "Does anyone care?" Answered by scoring against the fighter's history.

### 12.1 Per-fighter timeline (memory + feature)
- Maintain a dated, append-only history per fighter of reported/seen facts.
- Acts as a **watermark**: agent knows the date of its last confirmed news, so the shallow filter can cheaply reject anything at/before it before spending deep tokens — and can detect gaps (news it may have skipped).
- Bonus: the timeline is itself a valuable artifact — a clean, algorithm-free career log per fighter the group can browse. Candidate future feature.

### 12.2 Importance scoring
- Importance is **relative to the fighter's own history**, not a property of the item alone. Example: "Fighter C did an interview" = noise; "Fighter C's *first* interview after a loss" = important. The timeline is the context that makes this judgment possible.
- At **write time**, agent assigns each saved fact an explicit **importance score (e.g. 1–5)** using the timeline as context, stored alongside the date and source/trust tier.
- **Notification threshold = tunable line on importance.** Post to the group only if importance ≥ threshold.
- **Only important facts (>= threshold) are recorded to the timeline.** The timeline is a curated highlight reel, not a noise log — this is a deliberate decision (better artifact, matches what the group cares about).
- **Cost trap avoided — timeline vs. dedup ledger split:** if unimportant items were simply discarded, every scheduled run would re-encounter them as "new," re-spend tokens judging them, and re-reject them (the same re-analysis loop that blows up cost). Resolution:
  - **Timeline** (user-visible): stores only important facts.
  - **Dedup ledger** (invisible, cheap): a lightweight "seen and dismissed" fingerprint — just an item ID/hash, no rich content, no importance analysis — for every candidate item already looked at. The shallow pass checks this ledger first and instantly skips known junk without re-reasoning.
  - Net: important facts enrich the timeline; everything else leaves only a tiny fingerprint so it's never judged (or paid for) twice, and never pollutes the timeline.

### 12.3 Storage implication
The state store (SQLite or similar, see §6) has two logically distinct parts:
- **Timeline table** (important facts only), per fact: fighter, date of event, first-seen date, source + trust tier, importance score, current claim status (rumor/confirmed/debunked), delivered? flag.
- **Dedup ledger** (all seen candidates): item ID/hash + seen date only. Minimal footprint; drives the cheap shallow-pass skip.

## 13. Storage Design (relational backbone + vector layer)

**Verdict: relational backbone, with a small vector layer for semantic tasks. Skip NoSQL.**

### 13.1 Relational (source of truth) — SQLite
- The timeline, dedup ledger, fighters, sources, claim statuses, dates, importance scores are all structured with clear relationships and exact-match / range queries ("everything for this fighter after this date above this importance"). Textbook relational.
- SQLite specifically: just a file on the laptop, no server to run, trivial to back up. Ideal for this scale.
- **NoSQL rejected:** its strengths (massive scale, schemaless flexibility) don't match a modest, well-defined data shape. Would be solving a non-problem.

### 13.2 Vector layer (semantic meaning) — only where it earns its place
Embeddings are used for two things:
1. **Semantic dedup / novelty:** detect when a new item restates an existing fact in different words (exact-match can't catch rewording). Compare incoming item embedding against stored fact embeddings.
2. **Conversational recall:** semantically retrieve relevant past news/context to answer follow-ups ("how does this opponent stack up?").

**What gets embedded (only comparable-by-meaning text):**
- A short semantic representation of each news fact (the core claim in 1–2 sentences).
- Incoming candidate items at judgment time (to compare against existing facts).
- Richer saved summaries / context blurbs (for conversational recall).

**What is NOT embedded (stays relational, queried exactly):** dates, fighter names, importance scores, source trust tiers, claim status, delivered flag. Never fuzzy-query these.

### 13.3 How the two link — vector points to row
- **The relational row is the source of truth; the embedding carries a pointer (the row's ID) back to it.** Direction is vector -> row, because queries flow from fuzzy meaning to exact truth: semantic search returns nearest embeddings + their row IDs, then an ordinary lookup/join resolves the full structured record.
- The row does not generally point back to its embedding (you can cheaply regenerate one). Exception: optionally keep the vector's ID on the row for lifecycle housekeeping (delete/refresh the vector when a fact is deleted/updated).

### 13.4 Implementation — one SQLite file, joined by ID
- Use a SQLite vector-search extension (e.g. sqlite-vec / similar). Embeddings live in a virtual vector table; each entry stores the ID matching the relational row's primary key (a foreign key in spirit).
- Query flow: semantic search against the vector table -> returns nearest embeddings + IDs -> lookup/join against the main relational tables by those IDs -> full structured record.
- Result: no separate vector database. Fuzzy index and exact truth live in the same file on the laptop, stitched by the shared identifier.

## 14. Deployment, CI/CD & Remote Access

**End state (fully automated, production-style):** develop on the new laptop with Claude Code -> commit/push to main on GitHub -> GitHub Actions workflow triggers -> a **self-hosted GitHub Actions runner** on the old laptop picks up the job -> pulls new code, rebuilds the Docker image, restarts the container. Never touch the old machine for routine deploys.

### 14.1 Why pull-based (self-hosted runner)
- The old laptop is behind a home router: **outbound connections are easy, inbound are hard** (same insight as the tunnel).
- Push-based deploys (GitHub reaching into the machine) would require inbound access and more exposed surface. Rejected.
- The self-hosted runner **dials out** to GitHub and waits for jobs — no inbound path needed, purpose-built for running deploy commands safely.

### 14.2 Why NOT reuse the Cloudflare tunnel for deploys
- The tunnel exposes one web service (the bot's webhook endpoint) for small HTTPS requests — app traffic.
- Deploys are machine operations (shell commands, image rebuilds, container restarts). Routing them through the tunnel would mean hand-rolling a custom "deploy now" endpoint plus guarding it — fragile, more code, worse security.
- **Mental model — same laptop, two doors:** the tunnel is for the app's traffic (Telegram/users -> bot); the runner is for operating the machine (deploys/builds). Keep them separate.

### 14.3 SSH — the manual side door
- SSH from the new laptop gives a secure remote terminal on the old one: used for initial setup, debugging, and anything hands-on.
- **Claude Code on the new laptop uses this same SSH channel** to do the old machine's setup work (Docker install, tunnel config, runner install) — no need to work on the old laptop directly.
- SSH stays permanently as the manual access path even after deploys are automated.

### 14.4 Docker notes (mechanics)
- No prebuilt FighterBot image exists — **build your own**: start from the official Node base image (auto-pulled on first build), Dockerfile copies the Mastra app in, installs deps, runs it. Container runs with restart-on-boot.
- Phase one shortcut allowed: run the Node app directly (no Docker) just to prove the pipe, then containerize for reliability.

### 14.5 Build order for this layer (don't build all three at once)
1. **SSH first** — it's the key to the old machine; lets Claude Code do the heavy lifting remotely.
2. **Prove the bot runs** (manual deploys: push to GitHub, pull + restart on the old laptop — two commands).
3. **Add the self-hosted runner** once manual deploys become annoying (the annoyance tells you exactly what to automate).

**Status note:** domain antonfomin.com is registered (directly through Cloudflare, so DNS is already on Cloudflare — no nameserver migration needed).

## 15. Telegram Setup — Verified Findings (from live testing)

- **Bot created:** `@${BOT_USERNAME}`. Token captured and stored securely. Test group created with bot added.
- **Chat IDs captured (whitelist seeds):** admin DM = `${ADMIN_CHAT_ID}` (positive; in private chats chat.id == user id). Test group = `${TELEGRAM_CHAT_ID}` (negative, `"type":"group"`). Real values live in `.env` / Cloud Run env vars, never in the repo.
- **Privacy mode behavior — VERIFIED empirically:** in groups, plain @mentions do NOT reach the bot. Only slash commands (e.g. `/start@${BOT_USERNAME}`) and replies to the bot's own messages pass the filter. **Design consequence for the Responder:** conversational follow-ups from friends must be *replies* to the bot's posts (natural gesture anyway) or commands — not bare mentions. DMs are unfiltered: every message arrives.
- **Group → supergroup upgrade caveat:** the test group is currently a basic "group" (plain negative ID, no -100 prefix). Telegram silently upgrades groups to supergroups when certain settings change — **and the chat ID changes** to a new -100-prefixed number. Mitigation: log rejected/unknown chat IDs so an upgrade doesn't look like a mystery outage; expect the real friends' group may be a supergroup from birth.
- **Update anatomy notes:** Telegram pre-parses messages — `entities` array labels commands/mentions/URLs (no regex needed). `update_id` is the ack counter. `language_code` of sender is included (useful for the bilingual group).
- **getUpdates vs webhook:** `getUpdates` (browser/API pull) works only while no webhook is registered; they're mutually exclusive. Used it to capture chat IDs pre-infrastructure.
- **Whitelist rule (day one):** webhook handler drops any update whose chat.id is not in {DM, test group, friends' group}; strangers get silence. Bot username is discoverable/guessable — whitelist is the lock, not obscurity.

## 16. Cloud-First Architecture Pivot (supersedes self-host plan in Sec. 4 & 14)

**Decision:** abandon self-hosting on the old MacBook. Go cloud-first from day one. Rationale: the goal is *agentic application* learning, not *infrastructure* learning — the laptop path spends the first weekends on plumbing (wipe, SSH, tunnel, runner) before a single agent exists. Cloud gets the hunter written by weekend one. The laptop remains a fun optional project, but shouldn't gate the interesting work.

### 16.1 Chosen stack (all free-tier)
- **Compute: Google Cloud Run** — runs a container, not a VM, not a bare machine. You never manage an OS; Google owns everything below the container image. Scale-to-zero. Free tier (per billing account/month, shared across all services): 2M requests, 180K vCPU-seconds, 360K GiB-seconds (request-based billing); instance-based billing gives 240K vCPU-s / 450K GiB-s. A once-hourly 1-minute job at 1 vCPU / 512 MiB is effectively $0.
- **Database: Neon** *(amended 2026-08-06; was Supabase)* — serverless Postgres + pgvector. Collapses the Sec. 13 relational-backbone + vector-layer design into a single DB. Free tier: ~0.5 GB, multiple projects allowed, autosuspends after minutes and **auto-resumes on the next connection** (~0.5–1s cold start) — no manual unpause, no keep-alive needed. Why the switch: Anton's Supabase account was already at its 2-free-project limit; we only need the Postgres core anyway (no auth/storage/APIs), and Neon's scale-to-zero-and-self-wake model matches the Cloud Run stack's philosophy. Live as project `fighter-bot` (`${NEON_PROJECT_ID}`, aws-us-west-2 Oregon — next door to GCP us-west1). Connection string in Secret Manager as `neon-db-url`.
- **Embeddings: Gemini API free tier** (`gemini-embedding-001`, 768 dims via Matryoshka truncation) — for cross-language semantic dedup (same story, EN vs UK outlets). ~100 RPM / ~1K RPD free covers hunter volume with 10–20× headroom; $0. Embeddings are model-locked, so the model name is stored beside each vector. Key in Secret Manager as `gemini-api-key`.
- **Deploys: GitHub Actions** → Cloud Run (retires the self-hosted runner and the Cloudflare tunnel entirely — Cloud Run gives a real HTTPS URL for the webhook out of the box).

### 16.2 What the pivot deletes from the old plan
Cloudflare named tunnel, SSH setup, self-hosted GitHub Actions runner, laptop wipe/Docker/pmset — all gone. Section 14's home-server machinery is superseded. Reliability improves (datacenter vs. home WiFi).

### 16.3 Component → billing-model mapping
- **Responder (Telegram webhook):** request-based billing. Wrinkle: under request-based, CPU is throttled after the response is sent — so the "ack-then-reply-later" pattern can stall background work. Fix: keep the request open while the agent thinks (Telegram's timeout tolerance covers a few seconds), OR run heavy work elsewhere.
- **Hunter (scheduled discovery):** a Cloud Run **Job** (instance-based, runs to completion), triggered by **Cloud Scheduler** (cron). 
- Billing models do NOT compound: each service uses one model and draws from that model's pool; the free tier is per billing account, shared across services. Don't architect to game allowance arithmetic — pick the model that fits each component's behavior.

### 16.4 Cost safety (Cloud Run can't hard-cap, only alert)
- **Cloud Run:** set **max instances = 1** as a hard physical ceiling — worst case is one small instance 24/7 (a few $, mostly inside free tier). A runaway can't multiply.
- **The real runaway risk is the LLM API**, not compute. Set a genuine **hard spend cap on the LLM provider key** (Anthropic / Google AI Studio both support this) — that's where a real cap exists and matters.
- **Billing alert** at ~$5 (alerts only email; they don't stop anything). Nuclear option exists (budget triggers a script that disables project billing) but it's blunt — not needed at this scale.
- Note: a valid billing account (card on file) is required even for free-tier usage; $0 charged while inside limits.

### 16.5 GCP mental model (for first-time hands-on)
- **Project** = the container for all resources, billing links, permissions. Everything lives in one. Delete the project = everything vanishes. (Name it e.g. "fighterbot".)
- **Billing account** = separate from the project; holds the card; one account can power many projects.
- **APIs must be explicitly enabled** per service (classic first-timer stumble — nothing is live until switched on: enable Cloud Run API, etc.).
- **IAM** = who/what can do what; even services have identities with roles (how Cloud Run is later allowed to read a secret or reach the DB).
- **Footprint = three services:** Cloud Run (runs the container), Cloud Scheduler (cron that pokes it), Secret Manager (holds tokens).

### 16.6 Container mechanics & deploy flow
- Cloud Run runs a **container image** built from a **Dockerfile** — the same image you build/test locally runs unchanged in the cloud ("build once, runs anywhere"). This is the payoff of containerizing from day one.
- Flow: write Dockerfile → build image locally (prove the bot runs in a container) → push to **Artifact Registry** (Google's image shelf) → Cloud Run pulls & runs it.
- Shortcut: Cloud Run can build+push from source in one command (point it at code + Dockerfile). Doing it by hand once is the recommended learning moment; the source-deploy shortcut is fine thereafter.

**What's inside the image — four layers, bottom to top:**
1. **Minimal Linux base** — arrives inside the official Node base image; never installed, patched, or managed by us.
2. **Node.js runtime** — the engine executing the TypeScript/Mastra app. Layers 1+2 come together from a single `FROM node:...` line.
3. **Dependencies** — npm packages installed at build time from `package.json`: Mastra, Telegram library, Postgres client (`pg`), LLM SDK.
4. **Application code** — the bot itself: webhook handler, agent logic, tools, relevance scoring.
Plus **config**: the start command (CMD) and the port the app listens on (Cloud Run routes traffic to it).

**What is NOT inside the container:**
- **No database** — Neon lives outside and is reached over the network.
- **No cron** — Cloud Scheduler pokes the container from outside.
- **No secrets baked into the image** — bot token and API keys are injected as env vars at runtime (see Sec. 7).
- **No OS to administer** — only the slim userland Node needs.

### 16.7 Tooling / automation trajectory
- **gcloud CLI** = Google's official command line; can do essentially everything the console can — the escape from clicking once comfortable.
- **Endgame is not manual repetition:** capture setup as a **shell script of gcloud commands** (readable, version-controlled, rerunnable). Terraform (infra-as-code) is overkill for one service — reach for it only if this grows.
- **Learning approach agreed:** do it by hand in the console once to understand it → capture as a gcloud script → only reach for Terraform if it ever grows big. No GCP MCP driven on the user's behalf — the hands-on is the point. Command/console work happens in the **text interface**, not voice.

### 16.8 RAM: container vs VM (clarification captured)
- **Container platform (Cloud Run):** the configured 256/512 MiB is effectively all yours — no OS inside the container to feed (kernel lives on Google's host). Node/Mastra idles ~100–200 MB. If a container exceeds its limit it's OOM-killed & restarted → one-line bump to 512 MB/1 GB, priced per-second only while running.
- **VM (e.g. GCP e2-micro free VM):** total machine memory; Linux + daemons eat ~150–300 MB (headless server) before your code. A GUI desktop install climbs to ~1–1.5 GB idle. macOS on the old laptop: ~3–5 GB idle + Docker Desktop's hidden Linux VM (2–4 GB) — the overhead argument that partly motivated the cloud pivot.

### 16.9 Immediate next step (do in TEXT interface, at keyboard)
Guided hands-on setup: create the GCP project → enable APIs → get Cloud Run breathing → capture as a gcloud script along the way. Accounts to create: Google Cloud (enable Cloud Run + Scheduler, billing alert ~$5), Neon (was Supabase — see 16.1), Google AI Studio key for embeddings; GitHub already in hand for Actions deploys.

## 17. Open Questions (resolve before/at build start)

1. **LLM provider/model** for the relevance judgment and conversational agent — not yet chosen (affects free-budget math; API calls are the one recurring cost not yet nailed down).
2. **Exact source list per fighter** — which Telegram channels / news sites / email digests actually cover Fighter A and Fighter B reliably (Fighter C has abundant coverage; the other two may be sparse).
3. **State store choice** — SQLite vs. flat files vs. something Mastra prefers.
4. **Cron frequency** — hourly was discussed as the reference point; confirm.
5. **Language** — should the bot post in Ukrainian, English, or mixed?
6. **Fighter name canonicalization** — sources will spell names differently (transliterations); need alias lists per fighter.
