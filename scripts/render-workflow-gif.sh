#!/usr/bin/env bash
# Renders assets/workflow.svg into the README's animated GIFs, one per theme:
# assets/workflow.gif (light) and assets/workflow-dark.gif (dark).
# GitHub shows SVG animation as a still image, so the README embeds these.
#
# Needs: chromium (or $CHROMIUM) and ffmpeg.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
svg="$root/assets/workflow.svg"
chromium="${CHROMIUM:-chromium}"
fps=12
seconds="$(grep -oE -- '--cycle: [0-9.]+s' "$svg" | grep -oE '[0-9.]+')"
width="$(grep -oE '<svg[^>]* width="[0-9]+"' "$svg" | grep -oE '[0-9]+"$' | tr -d '"')"
height="$(grep -oE '<svg[^>]* height="[0-9]+"' "$svg" | grep -oE '[0-9]+"$' | tr -d '"')"
frames="$(awk -v s="$seconds" -v f="$fps" 'BEGIN { printf "%d", s * f }')"

work="$(mktemp -d "$root/.render.XXXXXX")"
trap 'rm -rf "$work"' EXIT

render() { # theme scheme-flag output
  local theme="$1" flag="$2" out="$3"
  mkdir -p "$work/$theme"
  for ((i = 0; i < frames; i++)); do
    local t
    t="$(awk -v i="$i" -v f="$fps" 'BEGIN { printf "%.3f", i / f }')"
    {
      printf '<!doctype html><html><head><style>html,body{margin:0;background:transparent}'
      printf '*{animation-play-state:paused!important;animation-delay:-%ss!important}</style></head><body>' "$t"
      cat "$svg"
      printf '</body></html>'
    } > "$work/frame.html"
    "$chromium" --headless --disable-gpu --hide-scrollbars --force-device-scale-factor=1 \
      ${flag:+"$flag"} --window-size="$width,$height" \
      --screenshot="$work/$theme/$(printf '%04d' "$i").png" "file://$work/frame.html" 2>/dev/null
  done
  ffmpeg -loglevel error -y -framerate "$fps" -i "$work/$theme/%04d.png" \
    -filter_complex "[0:v]split[a][b];[a]palettegen=max_colors=128:stats_mode=full[p];[b][p]paletteuse=dither=none:diff_mode=rectangle" \
    -loop 0 "$out"
  echo "wrote ${out#"$root/"} ($frames frames)"
}

render light "" "$root/assets/workflow.gif"
render dark "--blink-settings=preferredColorScheme=0" "$root/assets/workflow-dark.gif"
