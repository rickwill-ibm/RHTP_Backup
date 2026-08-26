#!/usr/bin/env bash
# scripts/ship.sh — ONE command to stage, gate, commit, push, and print the PR link.
#
#   npm run ship -- "fix(x): message"          # fast + push gates (via git hooks)
#   npm run ship -- "fix(x): message" --ci      # ALSO run the full CI gate locally first
#                                               # (adds mutation E13 + build E16 / next build)
#
# The pre-commit (fast) and pre-push (push) hooks already run the canonical gate, so this
# does not bypass anything — it removes the ceremony you kept having to remember.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

MSG=""; RUN_CI=0
for a in "$@"; do
  case "$a" in
    --ci) RUN_CI=1 ;;
    *)    MSG="$a" ;;
  esac
done
[ -z "$MSG" ] && { echo 'usage: npm run ship -- "commit message" [--ci]'; exit 2; }

# 1) clear a stale lock left by an interrupted git op (common on Windows / synced paths)
[ -f .git/index.lock ] && { echo "[ship] clearing stale .git/index.lock"; rm -f .git/index.lock; }

# 2) never ship straight to main
BRANCH="$(git rev-parse --abbrev-ref HEAD)"
[ "$BRANCH" = "main" ] && { echo "[ship] refusing to push to main — create a branch first"; exit 2; }

# 3) optional: run the FULL gate locally (types, sizes, lint, unit, wiring, provenance,
#    shuffle, mutation E13, and build E16 = next build) before committing
if [ "$RUN_CI" -eq 1 ]; then
  echo "[ship] running full CI gate locally (this includes next build)…"
  bash scripts/ci-gates.sh ci || { echo "[ship] gate FAILED — fix before shipping"; exit 1; }
fi

# 4) stage everything (.gitignore keeps _to_delete/_backups/_local-only out); show what ships
git add -A
if git diff --cached --quiet; then echo "[ship] nothing to commit — working tree clean"; exit 0; fi
echo "[ship] staging:"; git --no-pager diff --cached --name-status

# 5) commit (fires pre-commit: prettier + fast gate) and push (fires pre-push: gate push)
git commit -m "$MSG" || { echo "[ship] git commit FAILED — usually a held .git/index.lock (close VS Code / stop any auto-sync). Nothing was pushed."; exit 1; }
if git rev-parse --abbrev-ref --symbolic-full-name '@{u}' >/dev/null 2>&1; then
  git push || { echo "[ship] git push FAILED — your commit is saved locally; just retry the push."; exit 1; }
else
  git push -u origin "$BRANCH" || { echo "[ship] git push FAILED — your commit is saved locally; just retry the push."; exit 1; }
fi

# 6) PR link (derived from the remote, so it works on any fork/repo)
REMOTE_URL="$(git config --get remote.origin.url | sed -E 's#git@github.com:#https://github.com/#; s#\.git$##')"
echo ""
echo "[ship] pushed '$BRANCH' — all gates passed. Open a PR:"
echo "  ${REMOTE_URL}/pull/new/${BRANCH}"
