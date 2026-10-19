# Deployment branches and the dev3 local workstation

Recorded on 2026-10-19. Branch names describe source history; they do not by
themselves prove which revision is running. For dev3, compare the authenticated
`/api/health` response's `commit_sha` with the deployment ref below.

## Branch map

| Ref | Revision at this handoff | Meaning |
| --- | --- | --- |
| `deploy/dev3-local-20261019` | `918225572e1fb6805fe1b9ea8286fbf1ea7f2501` | Exact source revision running at [dev3](https://dev3.acetoken.net/app/). Python API and Conexus Host both run locally on the Mac mini. |
| tag `dev3-local-20261019` | `918225572e1fb6805fe1b9ea8286fbf1ea7f2501` | Immutable marker for that deployed revision. |
| `sync/dev3-local-20261019` | Deployment revision plus this handoff | Review branch containing the four deployed fixes, this branch map, credential-free macOS management examples, and private-file ignore rules. Its additional documentation and examples have not been deployed. |
| `main` and `dev_liu` | `a49b1ebd69cb14a93c4dc08155234ad81464537a` | Current upstream 0.7.0 local-Conexus foundation at handoff; does not yet include the four dev3 fixes until the synchronization PR is merged. |
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

## Deployed fixes

| Commit | Behavior |
| --- | --- |
| `c700227` | Authenticated browser requests use the saved, scoped Agent Run bearer credential for polling, events, cancellation and answers instead of forwarding browser Basic auth to Conexus. |
| `6a905a5` | Model connection checks honor the explicitly configured model proxy for remote endpoints, bypass it for loopback endpoints, and cap Agent output at 8192 tokens. |
| `0089bdd` | Model tools with conditional optional fields explicitly disable implicit strict conversion, while preserving an explicitly requested strict schema. This lets successful Agent runs complete without an invalid blocker field. |
| `9182255` | Model settings initialize without requiring browser `crypto.randomUUID`, including ordinary HTTP origins and environments without that API. Provider IDs identify settings records, not authentication credentials. |

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

- Backend suite: 375 passed and 8 skipped; two Linux-only flock/systemctl
  deployment cases were excluded on macOS.
- Frontend tests, lint and production build: 25 tests passed after the browser
  compatibility fix. Contract, facade and repository-hygiene checks passed.
- Pinned Conexus core: 205 checks passed earlier in the same local migration;
  unchanged core artifacts were reused for the frontend-only fix.
- Real-provider, read-only Agent acceptance called `projects.list`, reached
  `completed`, delivered its terminal event and persisted its assistant reply.
  Restart checks retained that Run, its conversation and historical reports.
- The `crypto.randomUUID` startup error was reproduced on an HTTP browser
  origin before the fix; the same origin loaded the workstation and saved
  provider settings after the fix.
- Authenticated public routes and current JS/CSS assets returned 200;
  anonymous website/API requests returned 401.

No new backtest, data synchronization, research edit or trade was executed for
the read-only deployment acceptance. Local audits retained the original
research data and checked historical report content without publishing it.

## Private material stays outside Git

The repository contains code, documentation and empty configuration examples.
It does not contain an instance's populated environment file, OpenRouter key,
browser password, Conexus token, SSH/Cloudflare credential, model profile,
database, report export, Run history, log, or backup.

The operator must back up these files privately. Never attach the runtime or
backup directories to a PR, release asset or issue. When publishing future
changes, inspect every new commit and outgoing blob, not just the final diff:
removing a secret in a later commit would still leave it in pushed history.
