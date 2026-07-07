<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.

# Project workflow

Do not start or offer local preview servers for routine changes. This project is worked on directly on the server.

After every completed change, create a git commit and push it to the configured remote branch.

After every push, monitor the full server/deployment process until the application is running correctly, then tell the user they can start testing.

The full deployment process includes the GitHub Actions workflow for the exact pushed commit, not only local checks or a manual server deploy. After pushing, check the latest `CI and Production Deploy` run for the pushed branch/SHA and wait until all required jobs are complete. Do not tell the user they can test while any job is pending, failed, cancelled, skipped because of a failed dependency, or unknown. If `gh` is unavailable, use the GitHub Actions web UI or the public GitHub API, for example the repository actions runs and jobs endpoints.

Do not run the production deploy script manually in parallel with the GitHub Actions deploy job. Let the workflow deploy first; use a manual server deploy only when the workflow deploy cannot run or has failed, and report that intervention clearly.

For frontend changes, run the same checks that CI runs before committing: `npm run lint` and `npm run build` from `frontend/`. A local production deploy may also build the frontend, but it does not replace verifying the GitHub Actions result after the push.

If GitHub Actions fails, inspect the failed job, fix the cause, push a follow-up commit, and monitor the new run. If logs are not accessible, report the inaccessible logs and at least identify the failing job and step from the available Actions summary.
<!-- END:nextjs-agent-rules -->
