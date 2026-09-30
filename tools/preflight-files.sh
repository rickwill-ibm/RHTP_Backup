#!/usr/bin/env bash
# ─── tools/preflight-files.sh ────────────────────────────────────────────────
# DESIGN-TIME file-size preflight — turns a "surprise ratchet failure at push"
# into a "known list before you start". Three modes:
#
#   bash tools/preflight-files.sh                 # AUTO: every source file the current change set touches
#   bash tools/preflight-files.sh --changed       # AUTO (explicit; same as no args)
#   bash tools/preflight-files.sh <file> [file..] # explicit file(s), e.g. before editing them
#
# AUTO mode reuses the SAME change-set union as scripts/ci-gates.sh `changed_src`
# (committed-vs-$GATE_BASE ∪ staged ∪ unstaged ∪ untracked), so the list it prints
# is exactly the set the size + ratchet gate will judge — no drift, nothing hidden
# until the next re-run. Run it FIRST (npm run preflight) and you see every at-risk
# file at once, instead of fixing one and discovering the next.
#
# For each file it prints current lines, the FORMATTED line count (what prettier
# will expand a compressed file to — the number the gate actually uses), the cap,
# the baseline, and a STATUS that names the landmine.
#
# Advisory by default (exit 0 — the ratchet in check-file-sizes.sh is the real gate).
# Pass --strict to exit 1 when any 🔴 LANDMINE is present (for hook / CI use).
#
# STATUS legend:
#   ok                 — headroom; edit freely.
#   ○ exempt           — data/generated/backup file; not counted by the ratchet.
#   ⚠ approaching cap  — within 15% of the cap; a modest addition will breach it.
#   ⚠ baselined N      — frozen legacy file at N lines; net-zero edits only (any growth FAILS).
#   🔴 LANDMINE        — formats past cap/baseline; EXTRACT to a new module to earn
#                        headroom BEFORE adding to this file (AI-CODING-CONVENTIONS §2-3).
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

PROD=400; TEST=500
BASELINE_JSON="quality-baseline.json"
BASE="${GATE_BASE:-origin/main}"
STRICT=0

# Exempt globs mirror check-file-sizes.sh EXEMPT_PATTERNS (data / generated).
is_exempt() {
  case "$1" in
    */data/*.json|*/data/*.yaml|tools/seed/*|*.generated.ts|*.generated.tsx|*.seed.json| \
    */generateDetailedScreenPDF*.ts|*/generateTalkTrackPDF*.ts|*/AppLayout.nav.ts)
      return 0 ;;
  esac
  return 1
}

have_base() { git rev-parse --verify --quiet "$BASE" >/dev/null 2>&1; }
changed_src() {
  # Identical union to scripts/ci-gates.sh changed_src — keep in lockstep.
  local globs=('src/**/*.ts' 'src/**/*.tsx' 'src/**/*.js' 'src/**/*.jsx')
  {
    have_base && git diff --name-only --diff-filter=AM "$BASE"...HEAD -- "${globs[@]}" 2>/dev/null
    git diff --cached --name-only --diff-filter=AM -- "${globs[@]}" 2>/dev/null
    git diff --name-only --diff-filter=AM -- "${globs[@]}" 2>/dev/null
    git ls-files --others --exclude-standard -- "${globs[@]}" 2>/dev/null
  } | sort -u
}

FILES=()
for a in "$@"; do
  case "$a" in
    --changed) : ;;          # AUTO marker — auto-scan happens below when no explicit files remain
    --strict)  STRICT=1 ;;
    *)         FILES+=("$a") ;;
  esac
done
if [ "${#FILES[@]}" -eq 0 ]; then
  mapfile -t FILES < <(changed_src)
fi
if [ "${#FILES[@]}" -eq 0 ]; then
  echo "preflight: no changed source files (nothing about to land vs $BASE)."
  exit 0
fi

printf "%-58s %6s %6s %5s %9s  %s\n" "FILE" "lines" "fmt" "cap" "baseline" "STATUS"
printf '%.0s─' {1..118}; echo

landmines=0; cautions=0
for f in "${FILES[@]}"; do
  [ -f "$f" ] || { printf "%-58s  %s\n" "$f" "(not found)"; continue; }
  cur=$(wc -l < "$f" | tr -d ' ')
  if is_exempt "$f"; then
    printf "%-58s %6s %6s %5s %9s  %s\n" "$f" "$cur" "-" "-" "exempt" "○ exempt (data/generated)"
    continue
  fi
  fmt=$(npx --no-install prettier "$f" 2>/dev/null | wc -l | tr -d ' '); [ "${fmt:-0}" -eq 0 ] && fmt=$cur
  case "$f" in tests/*|e2e/*) cap=$TEST ;; *) cap=$PROD ;; esac
  base=$(grep "\"$f\"" "$BASELINE_JSON" 2>/dev/null | grep -oE '[0-9]+' | head -1)
  status="ok"
  if [ "$fmt" -gt "$cap" ]; then
    if [ -z "$base" ]; then
      status="🔴 LANDMINE: formats to $fmt > cap $cap, NOT baselined — EXTRACT first"; landmines=$((landmines + 1))
    elif [ "$fmt" -gt "$base" ]; then
      status="🔴 LANDMINE: formats to $fmt > baseline $base — EXTRACT first"; landmines=$((landmines + 1))
    else
      status="⚠ at-cap (baselined $base) — net-zero edits only"; cautions=$((cautions + 1))
    fi
  elif [ -n "$base" ]; then
    status="⚠ baselined $base — no net growth"; cautions=$((cautions + 1))
  elif [ "$fmt" -gt $((cap * 85 / 100)) ]; then
    status="⚠ approaching cap ($fmt/$cap)"; cautions=$((cautions + 1))
  fi
  printf "%-58s %6s %6s %5s %9s  %s\n" "$f" "$cur" "$fmt" "$cap" "${base:-none}" "$status"
done

echo
echo "preflight: ${#FILES[@]} touched source file(s) — ${landmines} landmine(s), ${cautions} caution(s)."
[ "$landmines" -gt 0 ] && echo "  🔴 EXTRACT the landmine file(s) into a new compliant module BEFORE committing (AI-CODING-CONVENTIONS §2-3)."
[ "$STRICT" -eq 1 ] && [ "$landmines" -gt 0 ] && exit 1
exit 0
