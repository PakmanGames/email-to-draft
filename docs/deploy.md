# Deploying email-to-draft

The app runs on Railway as one Next.js service and one Postgres database.
Design rationale lives in [decisions.md](decisions.md) (D-017, D-018) and [technical-design.md](technical-design.md) section 12.

| | |
| --- | --- |
| Railway project | `email-to-draft`, environment `production` |
| Services | `web` (this repo, branch `main`) and `postgres` (Railway Postgres 18) |
| Public URL | https://email-to-draft.apak.ca |
| Railway URL | https://web-production-76ad.up.railway.app |
| Infrastructure file | [`.railway/railway.ts`](../.railway/railway.ts) |

## How a deploy runs

Every push to `main` deploys automatically.

1. **Build.** Railpack installs Node from `engines.node` (24.x) and pnpm from `packageManager` (12.10.1), runs `pnpm install --frozen-lockfile`, then `pnpm build`.
2. **Pre-deploy.** `pnpm db:migrate` applies Drizzle migrations from inside the built image. If it fails, the deploy stops and the previous deployment keeps serving.
3. **Start.** `pnpm start` runs `next start` on the `PORT` Railway injects. `src/instrumentation.ts` validates the environment at startup, so a missing variable fails the deploy instead of the first request.
4. **Healthcheck.** Railway waits for `GET /` to return 200 before moving traffic to the new deployment.

Two things this pipeline depends on:

- **devDependencies stay installed.** The pre-deploy step uses `drizzle-kit`, a devDependency. Railpack does not prune dev dependencies by default. Setting `RAILPACK_PRUNE_DEPS` would break migrations.
- **The database is unreachable during the build.** Railway's private network only exists at runtime, so no page may query Postgres while it is being prerendered.

## Infrastructure as code

`.railway/railway.ts` declares the two services, the build, start, pre-deploy, and healthcheck settings, and the variables.
Railway does not read it during deploys. Changes take effect only when applied:

```sh
railway config plan    # preview, changes nothing
railway config apply   # preview, confirm, apply
```

Railway's older config-as-code files (`railway.json`, `railway.toml`) are deprecated, and new services cannot use them.
Custom domains cannot be declared in the file yet, so the domain is managed with `railway domain` (below).

## Environment variables (service `web`)

| Variable | Source | Notes |
| --- | --- | --- |
| `DATABASE_URL` | Reference to `postgres`'s private URL, declared in `.railway/railway.ts` | Private network only |
| `LLM_API_KEY` | Secret set by hand, declared as `preserve()` | Never in git. Set or rotate with the command below. |
| `LLM_BASE_URL`, `LLM_MODEL` | Not set | Defaults in `src/env.ts` (GroqCloud, `openai/gpt-oss-120b`) |
| `FAULT_INJECTION` | Not set | Set to `1` only for the live failure demo (FAIL-6) |
| `PORT` | Injected by Railway | |

Set or rotate the LLM key without it appearing in shell history:

```sh
printf %s "$NEW_KEY" | railway variable set LLM_API_KEY --stdin --service web
```

Setting a variable triggers a redeploy.

## Loading inventory

The `postgres` service has no public endpoint, on purpose, so the load runs inside the `web` container, which reaches the database over the private network.
`mock_data/` is not in git, so generate it locally first (`python3 generate_mock_data.py --rows 1000`).

```sh
# Once per machine: register the SSH key from your agent (or pass --key <fingerprint>).
# `railway ssh keys github` fails unless Railway's GitHub integration can read your keys.
railway ssh keys add

# Copy the CSV into the running container and load it.
railway service files --service web upload mock_data/shared/inventory.csv /tmp/inventory.csv
railway ssh --service web -- sh -c 'cd /app && pnpm db:load /tmp/inventory.csv'
```

The loader replaces the whole inventory in one transaction, so it is safe to rerun, and a failure leaves the previous inventory in place.
The uploaded file lives in the container's filesystem and disappears on the next deploy.
Expected output: `Loaded 12,000 parts and 23,584 offers`. Production was first loaded this way on 2026-10-11 in 2.0 s.

## Custom domain

`email-to-draft.apak.ca` was added with `railway domain email-to-draft.apak.ca --service web`.
It needs two records in the Cloudflare `apak.ca` zone:

| Type | Name | Content | Proxy |
| --- | --- | --- | --- |
| CNAME | `email-to-draft` | `e9yu1qne.up.railway.app` | DNS only |
| TXT | `_railway-verify.email-to-draft` | `railway-verify=8323746ce703f0393a3cd2df8ec2482be2048da48276f547cd9eb56a13aaee21` | |

With DNS only, Railway issues and renews the TLS certificate itself.
If the CNAME is ever proxied (orange cloud), the zone's SSL/TLS mode must be **Full**, not Flexible, or requests loop.
Check progress with `railway domain status email-to-draft.apak.ca --service web`.

## Logs

```sh
railway logs --service web               # runtime logs, streaming
railway logs <deployment-id> --build     # build logs
railway logs <deployment-id> --deployment
railway deployment list --service web    # IDs and statuses
```

## Rolling back

- **Fastest:** in the Railway dashboard, open `web`, then Deployments, pick the last good deployment, and choose Rollback. Traffic moves once its healthcheck passes.
- **Through git:** `git revert` the bad commit on `main` and push. This keeps `main` and production in agreement, so prefer it once the fire is out.
- **Schema:** migrations only move forward, and rolling back code does not undo them. Keep migrations additive (new columns nullable or defaulted) so the previous deployment still runs against the new schema.
