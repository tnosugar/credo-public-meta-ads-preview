#!/usr/bin/env bash
#
# public/meta-ads-preview/_render.sh — regenerate this public surface.
#
# Canonical source: ../../content/campaigns/meta-ads/prototype.html
# This script renders that source into the folder-as-contract that
# .github/workflows/sync-public.yml auto-discovers and mirrors to
# tnosugar/credo-public-meta-ads-preview (GitHub Pages).
#
# It produces, in THIS folder:
#   index.html   — prototype.html renamed (clean URL, no /prototype.html)
#   assets/...   — only the asset files actually referenced by the HTML
#   README.md    — public-repo README
#
# Per concepts/canonical-vs-rendered.md, prototype.html is canonical and
# this folder is derived: edit the prototype, re-run this script, the
# public surface falls out. Do NOT hand-edit index.html or assets/ here.
#
# Usage:
#   ./public/meta-ads-preview/_render.sh          # regenerate
#   ./public/meta-ads-preview/_render.sh --check  # verify in sync, write nothing
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
SRC_DIR="$(cd "$SCRIPT_DIR/../../content/campaigns/meta-ads" && pwd)"
SRC_HTML="$SRC_DIR/prototype.html"
CHECK_ONLY=false
[[ "${1:-}" == "--check" ]] && CHECK_ONLY=true

[[ -f "$SRC_HTML" ]] || { echo "ERROR: canonical source not found: $SRC_HTML" >&2; exit 1; }

# --- referenced assets (relative paths like assets/<vertical>/<file>) ---
mapfile -t REFS < <(grep -oE 'src="assets/[^"]*"' "$SRC_HTML" \
  | sed -E 's/^src="(.*)"$/\1/' | sort -u)
echo "Canonical source: $SRC_HTML"
echo "Referenced assets: ${#REFS[@]}"

# --- --check: confirm folder matches source, write nothing ---
if $CHECK_ONLY; then
  status=0
  if ! diff -q "$SRC_HTML" "$SCRIPT_DIR/index.html" >/dev/null 2>&1; then
    echo "OUT OF SYNC: index.html differs from prototype.html"; status=1
  fi
  for rel in "${REFS[@]}"; do
    [[ -f "$SCRIPT_DIR/$rel" ]] || { echo "MISSING: $rel"; status=1; }
  done
  # flag stray assets not referenced by the source
  while IFS= read -r have; do
    printf '%s\n' "${REFS[@]}" | grep -qxF "$have" || { echo "STRAY: $have"; status=1; }
  done < <(cd "$SCRIPT_DIR" && find assets -type f 2>/dev/null | sort)
  [[ $status -eq 0 ]] && echo "IN SYNC." || echo "Run without --check to regenerate."
  exit $status
fi

# --- regenerate ---
rm -rf "$SCRIPT_DIR/assets" "$SCRIPT_DIR/index.html"
cp "$SRC_HTML" "$SCRIPT_DIR/index.html"
for rel in "${REFS[@]}"; do
  mkdir -p "$SCRIPT_DIR/$(dirname "$rel")"
  cp "$SRC_DIR/$rel" "$SCRIPT_DIR/$rel"
done

cat > "$SCRIPT_DIR/README.md" <<'MD'
# Credo Meta Ads — Phase 1 prototype preview

Public mirror of the rendered Phase 1 Meta Ads prototype, for client and
collaborator review **before any ad spend**. Strategy, copy spec, campaign
plan, creative spec, and lead-form spec live in the private working repo and
are intentionally not mirrored here.

**Live preview:** https://tnosugar.github.io/credo-public-meta-ads-preview/

The prototype renders all six verticals — AllStates, Credit Card, Lawsuit,
Harassment, Medical Debt, Garnishment — as Facebook-feed mockups, each with a
carousel that swaps between aspect ratios (1:1, 4:5, 9:16, 1.91:1) and the
9:16 video.

---

*This folder is a derived surface. It is regenerated from
`content/campaigns/meta-ads/prototype.html` by `_render.sh` — do not hand-edit
`index.html` or `assets/`. Edit the prototype in the private repo, re-run
`_render.sh`, and push; `sync-public.yml` mirrors the result.*
MD

TOTAL=$(find "$SCRIPT_DIR" -type f -not -name '_render.sh' | wc -l | tr -d ' ')
echo "Wrote index.html + ${#REFS[@]} assets + README.md ($TOTAL files total, excluding _render.sh)."
