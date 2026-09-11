#!/usr/bin/env bash
# UserPromptSubmit hook — re-injected on EVERY turn, which is the whole point:
# it is the one channel that survives context compaction and long sessions.
#
# Deliberately short. A long injection on every turn is expensive and gets tuned
# out; three fields and a stop rule is what the observed failures actually needed.
set -euo pipefail

cat <<'EOF'
[RHTP-HOOK-ALIVE :: UserPromptSubmit] pre-flight gate armed.
Before substantial work — a document, deck, chart, plan, module, patch or
architectural decision — state and then STOP and wait:
  FRAME = <what world this is in; never inherited from a source document>
  SHAPE = <what the finished thing looks like, one line, in the user's terms>
  DONE  = <the falsifiable finished condition>
  BUDGET/METHOD = <cap, and solo vs coalition — solo needs an affirmative yes>
Recommendation first. Receipts, not checkmarks. Omit what you did not verify.
EOF
