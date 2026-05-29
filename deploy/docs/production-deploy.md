# Production deploy

This project deploys from the `env-config` branch to the VPS at `/home/ubuntu/shooting-system`.

The production deploy script is:

```bash
/home/ubuntu/shooting-system/deploy/scripts/deploy-production.sh
```

It performs the same operational steps every time:

1. Acquires a deploy lock.
2. Verifies it is running on `env-config`.
3. Refuses to continue if the worktree has local changes.
4. Fetches `origin/env-config` and updates only with a fast-forward merge.
5. Installs backend requirements into the existing virtualenv.
6. Installs frontend packages with `npm ci` and runs `npm run build`.
7. Runs Alembic migrations.
8. Syncs the tracked systemd/nginx config files when they changed.
9. Restarts backend, reloads frontend through PM2, validates nginx, and runs health checks.

## Current repository setup required

The VPS currently has `env-config` as the production branch, but GitHub must also have that branch before automated deploys can pull from it:

```bash
git push -u origin env-config
```

Do this only after confirming the branch contains exactly the production changes you want in GitHub.

The deploy script intentionally refuses dirty worktrees. If the VPS still has a local tracked change such as `frontend/package-lock.json`, resolve that change deliberately before running automated deploys.

## GitHub Actions

Workflow file:

```text
.github/workflows/production.yml
```

The workflow runs CI on pushes and pull requests targeting `main` or `env-config`:

- frontend: `npm ci`, `npm run lint`, `npm run build`
- backend: install requirements, `python -m compileall .`, Alembic upgrade against a temporary SQLite database

The deploy job runs only when all CI jobs pass and the workflow is on `refs/heads/env-config`.

Manual deploys can be started with `workflow_dispatch` from the `env-config` branch.

Pushes to `env-config` automatically deploy to production after CI succeeds.

Required GitHub repository secrets for deploy:

```text
PRODUCTION_SSH_HOST=192.99.43.63
PRODUCTION_SSH_USER=ubuntu
PRODUCTION_SSH_KEY=<private SSH key allowed to run the deploy script>
```

Optional secret:

```text
PRODUCTION_SSH_PORT=22
```
