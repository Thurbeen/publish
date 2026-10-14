#!/usr/bin/env bash
# Renders assets/workflow.svg into the README's images, one per theme:
# assets/workflow.png (light) and assets/workflow-dark.png (dark), at 2x.
# GitHub picks an <img> SVG's colours from the system, not from the reader's
# GitHub theme, so the README embeds these.
#
# Needs: chromium (or $CHROMIUM).
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
svg="$root/assets/workflow.svg"
chromium="${CHROMIUM:-chromium}"
width="$(grep -oE '<svg[^>]* width="[0-9]+"' "$svg" | grep -oE '[0-9]+"$' | tr -d '"')"
height="$(grep -oE '<svg[^>]* height="[0-9]+"' "$svg" | grep -oE '[0-9]+"$' | tr -d '"')"

work="$(mktemp -d "$root/.render.XXXXXX")"
trap 'rm -rf "$work"' EXIT
{
  printf '<!doctype html><html><head><style>html,body{margin:0;background:transparent}</style></head><body>'
  cat "$svg"
  printf '</body></html>'
} > "$work/page.html"

render() { # scheme-flag output
  "$chromium" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=2 \
    --default-background-color=00000000 ${1:+"$1"} --window-size="$width,$height" \
    --screenshot="$2" "file://$work/page.html" 2>/dev/null
  echo "wrote ${2#"$root/"}"
}

render "" "$root/assets/workflow.png"
render "--blink-settings=preferredColorScheme=0" "$root/assets/workflow-dark.png"
