#!/usr/bin/env bash

# --- English check function (from check-english.sh) ---
umlaut_pattern='[äöüÄÖÜß]'
german_words='und|der|die|das|nicht|bitte|änderung|anderung|änderungen|anderungen|übersetz|ubersetz|deutsch|deutsche|ich|wir|sie|dass|text|ä|ö|ü|ß'


# --- Determine changed files (works for pre-commit and CI workflow) ---
if [ -n "${GITHUB_ACTIONS:-}" ]; then
  # In GitHub Actions: compare with base branch (default: origin/main)
  BASE_BRANCH=${GITHUB_BASE_REF:-origin/main}
  CHANGED_FILES=$(git diff --name-only "$BASE_BRANCH...HEAD")
else
  if [ -n "$(git diff --name-only)" ]; then
    echo "[pre-commit] ERROR: You have unstaged changes. Please stage/stash or discard them before committing." >&2
    exit 1
  fi
  # Local pre-commit: use staged files
  CHANGED_FILES=$(git diff --cached --name-only)
fi

# --- Functions ---
get_index_file() {
  # Return staged (index) version of a file if available, else fall back to worktree file
  path="$1"
  git show ":$path" 2>/dev/null || cat "$path" 2>/dev/null || true
}

check_package_json_version_name() {
  if echo "$CHANGED_FILES" | grep -qx "package.json"; then
    echo "[pre-commit] Checking package.json version and name ..." >&2
    v_head=$(git show HEAD:package.json 2>/dev/null | jq -r .version || echo "")
    v_index=$(get_index_file package.json | jq -r .version || echo "")
    n_head=$(git show HEAD:package.json 2>/dev/null | jq -r .name || echo "")
    n_index=$(get_index_file package.json | jq -r .name || echo "")
    # echo "[pre-commit] HEAD version: '$v_head', index version: '$v_index'" >&2
    # echo "[pre-commit] HEAD name: '$n_head', index name: '$n_index'" >&2
    if [ "$v_head" != "$v_index" ] || [ "$n_head" != "$n_index" ]; then
      echo -e "\033[31m[pre-commit] ERROR: 'package.json' 'version' or 'name' was changed in this commit.\033[0m" >&2
      return 1
    fi
  fi
  return 0
}

check_apkbuild() {
  APK_PATH="alpine/package/modbus2mqtt/APKBUILD"
  apk_content=$(get_index_file "$APK_PATH")
  if [ -z "$apk_content" ] && [ -f "$APK_PATH" ]; then
    apk_content=$(cat "$APK_PATH")
  fi
  echo "$apk_content" | grep -F 'npmpackage="${pkgname}"' >/dev/null 2>&1 || {
    echo -e "\033[31m[pre-commit] ERROR: $APK_PATH must contain the line: npmpackage=\"\${pkgname}\"\033[0m" >&2
    return 1
  }
  return 0
}

check_eslint() {
  if command -v npx >/dev/null 2>&1; then
    ESLINT_ERRORS=0
    for file in $CHANGED_FILES; do
      case "$file" in
        *.js|*.ts|*.tsx|*.jsx)
          # echo "Running ESLint on $file..."
          if ! npx eslint --no-warn-ignored "$file"; then
            echo -e "\033[31m[pre-commit] ERROR: ESLint found problems in $file. Commit aborted.\033[0m" >&2
            ESLINT_ERRORS=1
          fi
          ;;
      esac
    done
    if [ "$ESLINT_ERRORS" -ne 0 ]; then
      return 1
    fi
  fi
  return 0
}

check_prettier() {
  if command -v npm >/dev/null 2>&1; then
    STAGED_FORMAT_FILES=$(echo "$CHANGED_FILES" | grep -E '\.(mts|mjs|ts|tsx|js|jsx|css|html|json|sh)$' || true)
    if [ -n "$STAGED_FORMAT_FILES" ]; then
      PRETTIER_OUTPUT=$(printf '%s\n' "$STAGED_FORMAT_FILES" | scripts/prettier-changed.sh)
      MODIFIED_FILES=$(git diff --name-only)
      if [ -n "$MODIFIED_FILES" ]; then
        echo -e "\033[31m[pre-commit] ERROR: Prettier modified files. Please review the changes before committing:\033[0m" >&2
        echo "$MODIFIED_FILES"| sed -e 's/^/\033[31m[pre-commit] ERROR:   /g' | sed -e 's/$/\033[0m/' >&2
        echo "$MODIFIED_FILES" | xargs -r git add || true
        echo -e "\033[31m[pre-commit] Staged formatted files. Aborting commit so you can verify changes.\033[0m" >&2
        return 1
      fi
    fi
  fi
  return 0
}

check_forbidden_extensions() {
  forbidden_exts="cjs cts js ts tsx"
  for file in $CHANGED_FILES; do
    ext="${file##*.}"
    for forbidden in $forbidden_exts; do
      if [ "$ext" = "$forbidden" ]; then
        echo -e "\033[31m[pre-commit] ERROR: File extension .$forbidden is not allowed in this ESM project: $file\033[0m" >&2
        return 1
      fi
    done
  done
  return 0
}
check_files_for_english() {
  local found=0
  local matches=()
  for file in $CHANGED_FILES; do
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
    echo -e "\033[31m[pre-commit] ERROR: Non-English (German) content detected in: ${matches[*]}\033[0m" >&2
    return 1
  else
    return 0
  fi
}

# --- Run all checks ---
FAILED=0
check_package_json_version_name || FAILED=1
check_apkbuild || FAILED=1
check_eslint || FAILED=1
check_prettier || FAILED=1
check_forbidden_extensions || FAILED=1
check_files_for_english || FAILED=1

if [ "$FAILED" -ne 0 ]; then
  echo -e "\033[31m[pre-commit]ERROR Commit aborted.\033[0m" >&2
  exit 1
fi

echo "[pre-commit] All checks passed." >&2
exit 0
