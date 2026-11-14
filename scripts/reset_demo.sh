#!/usr/bin/env bash
# Restore the demo library: every analysis in data/demo_snapshot/ plus the sample decks' slide images.
# usage: scripts/reset_demo.sh        (-h/--help prints this)
# Run it once after cloning, and again after rehearsals (live replays add spoken claims to a deck).
set -euo pipefail
if [[ "${1:-}" == "-h" || "${1:-}" == "--help" ]]; then sed -n 2,4p "$0"; exit 0; fi
cd "$(dirname "$0")/.."
SNAP=data/demo_snapshot
[[ -d $SNAP ]] || { echo "no snapshot at $SNAP"; exit 1; }
mkdir -p data/decks
for f in "$SNAP"/*.json; do cp "$f" data/decks/; done
if [[ -d $SNAP/slides ]]; then cp -r "$SNAP"/slides/. data/decks/; fi
echo "restored: $(cd $SNAP && ls *.json | tr '\n' ' ')"
echo "reload the browser tab (the server needs no restart)"
