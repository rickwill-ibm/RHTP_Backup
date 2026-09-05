#!/usr/bin/env bash
# ─── tools/preflight-files.sh ────────────────────────────────────────────────
# DESIGN-TIME file-state gate. Run this on every file a change intends to touch,
# BEFORE editing. It reveals the prettier-balloon / size-ratchet landmine at
# design time instead of at commit: for each file it prints current lines, the
# FORMATTED line count (what prettier will expand a compressed file to), the cap,
# the baseline, and whether an edit will breach the ratchet.
#
#   bash tools/preflight-files.sh <file> [<file> ...]
#
# STATUS legend:
#   ok                     — headroom; edit freely.
#   baselined N            — frozen at N; net-zero edits only (no growth).
#   LANDMINE               — formatting balloons it past cap/baseline; EXTRACT to
#                            a module (earn headroom) BEFORE adding to this file.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1
PROD=400; TEST=500
BASELINE_JSON="quality-baseline.json"
printf "%-58s %6s %6s %5s %9s  %s\n" "FILE" "lines" "fmt" "cap" "baseline" "STATUS"
printf '%.0s─' {1..110}; echo
for f in "$@"; do
  if [ ! -f "$f" ]; then printf "%-58s  %s\n" "$f" "(not found)"; continue; fi
  cur=$(wc -l < "$f" | tr -d ' ')
  fmt=$(npx --no-install prettier "$f" 2>/dev/null | wc -l | tr -d ' '); [ "${fmt:-0}" -eq 0 ] && fmt=$cur
  case "$f" in tests/*|e2e/*) cap=$TEST;; *) cap=$PROD;; esac
  base=$(grep "\"$f\"" "$BASELINE_JSON" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  status="ok"
  if [ "$fmt" -gt "$cap" ]; then
    if [ -z "$base" ]; then status="🔴 LANDMINE: formats to $fmt > cap $cap, NOT baselined — EXTRACT first"
    elif [ "$fmt" -gt "$base" ]; then status="🔴 LANDMINE: formats to $fmt > baseline $base — EXTRACT first"
    else status="⚠ at-cap (baselined $base) — net-zero edits only"; fi
  elif [ -n "$base" ]; then status="⚠ baselined $base — no net growth"
  fi
  printf "%-58s %6s %6s %5s %9s  %s\n" "$f" "$cur" "$fmt" "$cap" "${base:-none}" "$status"
done
