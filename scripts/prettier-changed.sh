#!/usr/bin/env bash
# Format only the given files and show only changed ones
if [ "$#" -eq 0 ]; then
  	echo "[prettier-changed]INFO No files to format." >&2
  	exit 0
fi
# echo "[prettier-changed]INFO Running prettier on files: $*" >&2
prettier --write "$@" 2>&1 | grep -E 'modified|formatted' || true
