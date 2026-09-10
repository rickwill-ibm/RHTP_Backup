# Archived scripts

Retired helpers moved out of the repo root during the Sept 2026 structure cleanup.
Kept for reference; not part of the supported workflow.

- **Git-sync / auto-push**: `auto-sync-github.*`, `auto-push-to-github.bat`,
  `auto_backup_to_github.sh`, `commit-staged-changes.bat`, `push_to_github.sh`,
  `rhtp_push_to_github.sh` — superseded by normal git and `scripts/ci-gates.sh` / `scripts/ship.sh`.
- **Auto-push demo launchers**: `start-demo-with-sync*.bat`, `start-demo-RICK.*` —
  their auto-sync references were repointed to `scripts/legacy/`. The `PROJECT_DIR`
  line still needs to be edited to your local repo-root path before use.
- **One-off dev scripts**: `land-*.sh`, `_firstline.mjs`, `_mkpr.sh`.
