#!/usr/bin/env bash
# Checks commit messages and changed files for German umlauts or typical German words (macOS compatible)

set -euo pipefail



# Pattern: German umlauts or sharp-s
umlaut_pattern='[äöüÄÖÜß]'
# A small set of common German words to detect obvious German text
german_words='und|der|die|das|nicht|bitte|änderung|anderung|änderungen|anderungen|übersetz|ubersetz|deutsch|deutsche|ich|wir|sie|dass|text|ä|ö|ü|ß'

# Function: check_files_for_english
# Usage: check_files_for_english "$CHANGED_FILES"
check_files_for_english() {
  local found=0
  local matches=()
  for file in "$@"; do
    case "$file" in
      *.png|*.jpg|*.jpeg|*.gif|*.bmp|*.ico|*.pdf|*.zip|*.tar|*.gz|*.bz2|*.xz|*.7z|*.mp3|*.mp4|*.mov|*.avi|*.mkv|*.ogg|*.wav|*.flac|*.exe|*.dll|*.so|*.bin)
        # skip common binary formats
        continue
        ;;
      *)
        if [ -f "$file" ]; then
          # check if file is binary (contains null byte)
          if grep -q $'\x00' "$file"; then
            continue
          fi
          if grep -Ei "$umlaut_pattern|$german_words" "$file" >/dev/null; then
            matches+=("$file")
            found=1
          fi
        fi
        ;;
    esac
  done
  if [ $found -eq 1 ]; then
    echo "Non-English (German) content detected in: ${matches[*]}" >&2
    return 1
  else
    echo "All checked files are English."
    return 0
  fi
}

# Example usage (uncomment to use standalone):
# check_files_for_english dt.txt
check_files_for_english dt.md
