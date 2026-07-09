#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SCRIPT_PATH="${SCRIPT_DIR}/render-clothing-assets.py"

INPUT_ROOT='games/gta/los-santos/server-data/resources/[mods]/slutvival-clothing/stream'
OUTPUT_ROOT='games/gta/los-santos/server-data/resources/[mods]/slutvival-clothing-audit/data/asset-renders'
PYTHON_BIN="${PYTHON_BIN:-}"
BLENDER_BIN="${BLENDER_BIN:-}"
SOLLUMZ_PATH=''
LIMIT=0
SIZE=768
SUPERSAMPLE=2
YAW=-18
PITCH=4
FORCE=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --input-root)
      INPUT_ROOT="$2"
      shift 2
      ;;
    --output-root)
      OUTPUT_ROOT="$2"
      shift 2
      ;;
    --python-bin)
      PYTHON_BIN="$2"
      shift 2
      ;;
    --blender-bin)
      BLENDER_BIN="$2"
      shift 2
      ;;
    --sollumz-path)
      SOLLUMZ_PATH="$2"
      shift 2
      ;;
    --limit)
      LIMIT="$2"
      shift 2
      ;;
    --size)
      SIZE="$2"
      shift 2
      ;;
    --supersample)
      SUPERSAMPLE="$2"
      shift 2
      ;;
    --yaw)
      YAW="$2"
      shift 2
      ;;
    --pitch)
      PITCH="$2"
      shift 2
      ;;
    --force)
      FORCE=1
      shift
      ;;
    *)
      echo "Unknown argument: $1" >&2
      exit 2
      ;;
  esac
done

RENDER_ARGS=(
  --input-root "$INPUT_ROOT"
  --output-root "$OUTPUT_ROOT"
  --size "$SIZE"
  --supersample "$SUPERSAMPLE"
  --yaw "$YAW"
  --pitch "$PITCH"
)

if [[ "$LIMIT" -gt 0 ]]; then
  RENDER_ARGS+=(--limit "$LIMIT")
fi

if [[ "$FORCE" -eq 1 ]]; then
  RENDER_ARGS+=(--force)
fi

if [[ -n "$SOLLUMZ_PATH" ]]; then
  RENDER_ARGS+=(--sollumz-path "$SOLLUMZ_PATH")
fi

if [[ -n "$PYTHON_BIN" ]]; then
  exec "$PYTHON_BIN" "$SCRIPT_PATH" "${RENDER_ARGS[@]}"
fi

if command -v python3 >/dev/null 2>&1; then
  exec python3 "$SCRIPT_PATH" "${RENDER_ARGS[@]}"
fi

if command -v python >/dev/null 2>&1; then
  exec python "$SCRIPT_PATH" "${RENDER_ARGS[@]}"
fi

if [[ -n "$BLENDER_BIN" ]]; then
  exec "$BLENDER_BIN" --background --python "$SCRIPT_PATH" -- "${RENDER_ARGS[@]}"
fi

echo "No Python runtime found. Set PYTHON_BIN or BLENDER_BIN." >&2
exit 2
