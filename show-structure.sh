#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$HOME/Desktop/tarkhineh-backend"
OUTPUT_FILE="$PROJECT_DIR/project-structure.txt"

if ! command -v tree >/dev/null 2>&1; then
    echo "Error: tree is not installed." >&2
    exit 1
fi

tree -a -I '.git|node_modules|project-structure.txt' "$PROJECT_DIR" > "$OUTPUT_FILE"

echo "Project structure saved to: $OUTPUT_FILE"
