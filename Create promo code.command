#!/bin/bash
# Double-click in Finder to create a free-access promo code for Evolution
# (testers, promotions). Answers a few questions, creates the code in the
# live database, and copies it to the clipboard. Codes are given away,
# never sold (Google Play policy). The same can be done on the phone:
# Settings → Admin: promo codes.
cd "$(dirname "$0")/backend" || exit 1
export PATH="$HOME/.volta/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

echo "Evolution — create a promo code"
echo "--------------------------------"
echo "(Press Return to accept the suggestion in [brackets].)"
echo

while true; do
  read -r -p "Plan — basic or pro? [pro] " tier; tier=$(echo "${tier:-pro}" | tr '[:upper:]' '[:lower:]')
  [[ "$tier" == "basic" || "$tier" == "pro" ]] && break
  echo "  Please type basic or pro."
done
read -r -p "How many days does the plan last? (blank = no end) " days
read -r -p "How many people can use it? (blank = unlimited) " max
read -r -p "Last date it can be used, YYYY-MM-DD? (blank = always) " expires
read -r -p "Note to remind you what it's for? " note
read -r -p "Your own code, e.g. SUMMER26? (blank = random) " own

args=(create --tier "$tier")
[[ -n "$days" ]] && args+=(--days "$days")
[[ -n "$max" ]] && args+=(--max "$max")
[[ -n "$expires" ]] && args+=(--expires "$expires")
[[ -n "$note" ]] && args+=(--note "$note")
[[ -n "$own" ]] && args+=(--code "$own")

echo
out=$(npm run -s promo-code -- "${args[@]}" 2>&1)
status=$?
echo "$out" | grep -v '^CODE='
code=$(echo "$out" | sed -n 's/^CODE=//p')
if [[ $status -eq 0 && -n "$code" ]]; then
  printf "%s" "$code" | pbcopy
  echo
  echo "✓ $code is copied — paste it into a message to your tester."
else
  echo
  echo "✗ The code wasn't created (see above)."
fi
echo
read -r -p "Show all codes? (y/N) " show
if [[ "$show" =~ ^[Yy] ]]; then
  echo
  npm run -s promo-code -- list
fi
echo
read -r -p "Press Return to close." _
