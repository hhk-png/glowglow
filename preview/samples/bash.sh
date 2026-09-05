#!/usr/bin/env bash
# Bash: comments, parameter expansion, arithmetic and quotes.
set -euo pipefail

NAME="${1:-world}"        # default value via parameter expansion
SCORES=(10 20 0xFF)       # array literal

say_hello() {
  local who="$1"
  echo "hello, ${who}"    # double-quoted string, not a comment
}

total=0
for score in "${SCORES[@]}"; do
  (( total += score ))
done

if (( total > 30 )); then
  say_hello "$NAME"
else
  echo "too small" >&2
fi

# arithmetic in $(( )) and command substitution stay readable
(( total % 2 == 0 )) && echo "even: $total"
