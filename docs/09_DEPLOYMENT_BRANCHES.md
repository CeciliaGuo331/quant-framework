# Deployment branches and the dev3 local workstation

Deployment recorded on 2026-10-19; CI maintenance updated on 2026-10-20. Branch names describe source history; they do not by
themselves prove which revision is running. For dev3, compare the authenticated
`/api/health` response's `commit_sha` with the deployment ref below.

## Branch map

| Ref | Revision at this handoff | Meaning |
| --- | --- | --- |
| `deploy/dev3-local-20261019` | `d0ce50c04b682dbd299c694660afc70504a207ff` | Exact source revision running at [dev3](https://dev3.acetoken.net/app/). Python API and Conexus Host both run locally on the Mac mini. |
| tag `dev3-local-20261019` | `d0ce50c04b682dbd299c694660afc70504a207ff` | Immutable marker for that deployed revision, including model/search settings and Agent connection recovery. |
| `sync/dev3-local-20261019` | Deployment revision plus this handoff | Review branch containing the seven deployed changes, this branch map, credential-free macOS management examples, and private-file ignore rules. It also includes subsequent CI dependency and cross-platform repairs. These additional changes have not been deployed. |
| `main` and `dev_liu` | `a49b1ebd69cb14a93c4dc08155234ad81464537a` | Current upstream 0.7.0 local-Conexus foundation at handoff; does not yet include the dev3 changes until the synchronization PR is merged. |
| `deploy/local` | `1c166ac99b163ccdbd669d419a614ce44d198c4f` | Older local integration. Not the current dev3 deployment source. |
| `dongfang` | `4adc0ef42bb30cabb3838bab4ebe622f7cfd9066` | Legacy external Conexus cloud/publication/tunnel integration. Not the current dev3 deployment source. |

This synchronization does not update `main`, `dev_liu`, `deploy/local`,
`dongfang`, or the dev2 service. Do not redeploy the older `deploy/local` or
`dongfang` branch expecting it to reproduce the current dev3 workstation.

## Current dev3 architecture

```text
Browser --HTTPS--> Cloudflare website tunnel --> Python API (loopback 8300)
                                                 |
                                          local Conexus Host
                                          (loopback 8387)
                                                 |
                                    private authenticated API forwarder
                                    (loopback 8301, same Python backend)
```

The website tunnel remains in use. The former Hong Kong SSH tunnel for the
external Conexus Agent is stopped and disabled. No external Conexus publication
or enterprise Web Host is required for the new Agent path.

Model requests use the operator's saved OpenRouter profile. The selected model
is `openai/gpt-5.6-sol`; this does not mean model weights are hosted locally.
The operator's existing local credential was configured privately on the Mac.
It differs from the old cloud Conexus credential. No credential value is part
of this repository or handoff.

Open **Model and search** in the sidebar to configure research models and web
search. Search supports OpenRouter, Brave Search, and off. It can follow the
active model profile or use a separate saved OpenRouter profile/account.
OpenRouter search needs no Brave key. Saved UI search settings override the
private environment fallback `ALPHALAB_WEB_SEARCH_PROVIDER=openrouter`. Each invocation permits one search, up to ten returned sources and
a bounded response size/timeout. Search is charged to the selected account
in addition to model usage. Brave remains an explicitly supported alternative.
Missing setup returns a non-retryable error; local research remains available.

Settings belong to one workstation and are shared by users of that installation.
Separate local installations may use different providers. The current dev3
shared login does not implement per-person settings or account isolation.
Model/search keys remain write-only and private to the backend.

## Deployed changes

| Commit | Behavior |
| --- | --- |
| `c700227` | Authenticated browser requests use the saved, scoped Agent Run bearer credential for polling, events, cancellation and answers instead of forwarding browser Basic auth to Conexus. |
| `6a905a5` | Model connection checks honor the explicitly configured model proxy for remote endpoints, bypass it for loopback endpoints, and cap Agent output at 8192 tokens. |
| `0089bdd` | Model tools with conditional optional fields explicitly disable implicit strict conversion, while preserving an explicitly requested strict schema. This lets successful Agent runs complete without an invalid blocker field. |
| `9182255` | Model settings initialize without requiring browser `crypto.randomUUID`, including ordinary HTTP origins and environments without that API. Provider IDs identify settings records, not authentication credentials. |
| `501217e` | Web Search can reuse the saved OpenRouter profile, returns actual source citations, bounds search calls/results, and never returns provider keys or error bodies. Missing search configuration is non-retryable. |

| `e7502ee` | Adds bilingual model/search settings, independent search accounts, write-only private keys, save-only model profiles, and safe connection tests without a restart. |
| `d0ce50c` | Reconnects interrupted Agent event streams using the last sequence, retries read-only requests, clears recovered connection errors, and recovers an accepted message after a lost POST response without repeating its billed submission. |

A completed backend Run could previously leave a sticky browser "Failed to fetch"
after a transient network interruption. Event-stream recovery now resumes the
same Run; the existing authoritative snapshot polling remains active. Permanent
authentication/authorization errors still surface to the user.

## Management and verification

See the [macOS management examples](../examples/deployment/macos-local/README.md).
The running instance keeps its private configuration and management entry point
under the operator's home directory. On that machine:

```bash
~/.local/bin/alphalab-dev3 status
~/.local/bin/alphalab-dev3 logs
~/.local/bin/alphalab-dev3 restart
~/.local/bin/alphalab-dev3 backup
~/.local/bin/alphalab-dev3 update
~/.local/bin/alphalab-dev3 rollback
```

LaunchAgents start after the service user logs in and restart failed processes.
The workstation has system sleep disabled. After a machine restart, log in to
the service account before expecting the user LaunchAgents to run.

The operator's existing loopback network proxy is required for the configured
remote model route; keep that proxy running. API/UI and tool traffic stay local.

Verification already performed on the deployment revision:

- Backend suite: 386 passed and 8 skipped; two Linux-only flock/systemctl
  deployment cases were excluded on macOS.
- Frontend tests, lint and production build: 40 tests passed with the settings and connection
  recovery changes. Contract, facade and repository-hygiene checks passed.
- Pinned Conexus core: 205 checks passed earlier in the same local migration;
  unchanged core artifacts were reused for these application changes.
- Real-provider, read-only Agent acceptance called `projects.list`, reached
  `completed`, delivered its terminal event and persisted its assistant reply.
  Restart checks retained that Run, its conversation and historical reports.
- OpenRouter search returned real official-documentation citations using only
  a public query. Search/provider adapter tests passed; full Agent search
  acceptance also completed through the local Web Search capability.
- The `crypto.randomUUID` startup error was reproduced on an HTTP browser
  origin before the fix; the same origin loaded the workstation and saved
  provider settings after the fix.
- Connection recovery tests interrupt a stream after delivery, replay old events,
  close a stream early, reject its initial connection, and lose a submission
  response. Recovery preserves event order and never repeats the submission.
- Settings UI acceptance saved a separate inactive model, disabled/tested search,
  switched to an independent OpenRouter profile, performed real public search,
  and retained settings after refresh in an isolated fixture workstation.
- Authenticated public routes and current JS/CSS assets returned 200;
  anonymous website/API requests returned 401.

No new backtest, data synchronization, research edit or trade was executed for
the read-only deployment acceptance. Local audits retained the original
research data and checked historical report content without publishing it.

## Review-branch CI maintenance (not deployed)

The sync branch updates dependency locks to pass both full frontend and production
runtime security audits without audit exclusions or lowering the failure threshold.
Tailwind 3 carried unpatched transitive advisories, so the dashboard and embedded
App compiler now use Tailwind 4. Dashboard class merging, CSS-variable syntax,
forced-color focus outlines and existing small shadow/blur values are migrated
with it. The existing HSL theme and radius settings remain loaded explicitly.
The supported Chromium target (128+) meets Tailwind 4 requirements.

Conexus changes were committed in a standalone maintenance checkout derived from
the verified public export, then imported through the existing checksum-verifying
importer. [Source provenance](../THIRD_PARTY.md) and `vendor/conexus/EXPORT.json`
record both the maintenance revision and its original upstream base. No private
Conexus Web Host or commercial files were copied.

Platform contracts now run Linux deployment cases only on Linux and compare
resolved editor file URIs on every OS. Linux deployment coverage remains active
in the three Ubuntu Python jobs. All other supported platforms keep the same
checks, and the workflow's audit gates remain unchanged.

Candidate validation on macOS: 386 backend tests passed, 10 skipped (including
both Linux deployment cases); 41 frontend tests passed, lint and desktop build
passed; 207 Conexus checks and core package-boundary checks passed. Frontend
full/production audits and the bundled runtime production audit each reported
zero vulnerabilities. Isolated UI checks cover model/search settings and theme
switching without using private project data or provider credentials.

These checks apply to the review candidate. The running dev3 deployment and its
recorded tag remain at `d0ce50c`; accepting this PR does not itself deploy it.

## Private material stays outside Git

The repository contains code, documentation and empty configuration examples.
It does not contain an instance's populated environment file, OpenRouter key,
browser password, Conexus token, SSH/Cloudflare credential, model profile,
database, report export, Run history, log, or backup.

The operator must back up these files privately. Never attach the runtime or
backup directories to a PR, release asset or issue. When publishing future
changes, inspect every new commit and outgoing blob, not just the final diff:
removing a secret in a later commit would still leave it in pushed history.
