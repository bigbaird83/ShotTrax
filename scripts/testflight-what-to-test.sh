#!/usr/bin/env bash
# What to Test line for .eas/workflows/production-ios-testflight.yml.
# Prints one line from the checked-out commit:
#   git log -1 --pretty=format:'%h %s'
# and, when the commit has a body, " — " plus the body collapsed to 240 characters.
# Does not call the network. A shallow clone is enough (only HEAD is read).
set -euo pipefail

if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  echo "Checked-out project has no git metadata. What to Test is read from the commit being built." >&2
  exit 1
fi

line=$(git log -1 --pretty=format:'%h %s')
if [ -z "$line" ]; then
  echo "git log -1 returned an empty subject." >&2
  exit 1
fi

# Drop git trailers (Co-authored-by and the like) so What to Test stays the commit text.
body=$(git log -1 --pretty=format:'%b' | sed -E '/^(Co-authored-by|Signed-off-by|Reviewed-by|Acked-by|Tested-by):/d')
body=$(printf '%s' "$body" | tr '\n\r\t' ' ' | sed 's/  */ /g; s/^ //; s/ $//')
if [ -n "$body" ]; then
  raw_len=${#body}
  body=${body:0:240}
  if [ "$raw_len" -gt 240 ]; then
    body=${body% *}
    body="${body}…"
  fi
  note="${line} — ${body}"
else
  note="$line"
fi
note=${note:0:4000}
printf '%s\n' "$note"
