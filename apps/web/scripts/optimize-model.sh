#!/bin/bash
# Compress a .glb in place: dedup -> re-encode embedded textures as WebP
# (same resolution, no quality/dimension change) -> Draco-compress geometry.
#
# Usage: scripts/optimize-model.sh public/models/whatever/thing.glb
#
# Every model already in public/ as of 2026-08-14 was run through this (see
# the load-time perf pass) — new models should go through it too before being
# committed. Requires the Draco decoder self-hosted at public/draco/ (already
# checked in, wired in src/engine/scene/gltfLoader.ts) since the compressed
# output needs it to decode at runtime.
set -e
if [ -z "$1" ]; then
  echo "usage: $0 <path-to.glb>"
  exit 1
fi
f="$1"
if [ ! -f "$f" ]; then
  echo "not found: $f"
  exit 1
fi
GT="npx --yes @gltf-transform/cli"
tmp1="${f}.tmp1.glb"
tmp2="${f}.tmp2.glb"
tmp3="${f}.tmp3.glb"
orig_size=$(stat -f%z "$f" 2>/dev/null || stat -c%s "$f")

$GT dedup "$f" "$tmp1"
$GT webp "$tmp1" "$tmp2"
$GT draco "$tmp2" "$tmp3"
rm -f "$tmp1" "$tmp2"

new_size=$(stat -f%z "$tmp3" 2>/dev/null || stat -c%s "$tmp3")
mv "$tmp3" "$f"
echo "$f: $orig_size -> $new_size bytes"
echo "Reload the game and visually confirm before committing — re-encoding"
echo "textures/geometry is generally safe but isn't zero-risk."
