#!/usr/bin/env bash
# agentic-build-framework is SOURCED from .claude/skills/ — that copy is the single
# source of truth. This script regenerates the plugin's copy and repacks the bundle.
# Run it after editing .claude/skills/agentic-build-framework/**.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="$(cd "$HERE/../../.." && pwd)"
SRC="$REPO/.claude/skills/agentic-build-framework"
DST="$HERE/skills/agentic-build-framework"

[ -d "$SRC" ] || { echo "source skill not found: $SRC" >&2; exit 1; }
mkdir -p "$DST/references"
cp "$SRC/SKILL.md" "$DST/SKILL.md"
cp "$SRC/references/"*.md "$DST/references/"

# every frontmatter must parse as YAML or the plugin is rejected at install
python3 - "$HERE" <<'PY'
import yaml, glob, os, sys
here = sys.argv[1]; bad = 0
for p in sorted(glob.glob(f"{here}/agents/*.md") + glob.glob(f"{here}/skills/*/SKILL.md")):
    try:
        yaml.safe_load(open(p, encoding="utf-8").read().split("---", 2)[1])
        print("yaml OK  ", os.path.relpath(p, here))
    except Exception as e:
        bad = 1; print("yaml FAIL", os.path.relpath(p, here), e)
sys.exit(bad)
PY

# zip writes a temp file then renames, which some mounted filesystems disallow.
# Build the archive in scratch, then copy it in (a plain write, always permitted).
OUT="$HERE/dist/rhtp-delivery-framework.plugin"
TMP="$(mktemp -d)"
mkdir -p "$HERE/dist"
( cd "$HERE" && zip -rq "$TMP/bundle.plugin" . -x "sync.sh" -x "dist/*" -x "*.DS_Store" )
cp "$TMP/bundle.plugin" "$OUT"
rm -rf "$TMP"
echo "packed: $OUT ($(wc -c < "$OUT") bytes)"
