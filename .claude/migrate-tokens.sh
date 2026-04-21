#!/usr/bin/env bash
# One-shot token migration for the Naqsha light+dark cascade.
# Rewrites hex literals and tailwind gray utilities in component files to
# semantic tokens. Skips the newly-written token-aware files.
#
# Safe to run multiple times (idempotent for the patterns it matches).
set -euo pipefail

cd "$(dirname "$0")/.."

# Files to skip — these already consume the token system directly.
SKIP=(
  "src/components/ui/Slider.jsx"
  "src/components/ui/CommitSlider.jsx"
  "src/components/ui/ThemeToggle.jsx"
  "src/lib/useTheme.js"
  "src/index.css"
  "src/styles/tokens.css"
  "tailwind.config.js"
)

is_skip() {
  local f="$1"
  for s in "${SKIP[@]}"; do
    [[ "$f" == "$s" ]] && return 0
  done
  return 1
}

# macOS sed requires -i '' (BSD); Linux requires -i (GNU). Detect.
if sed --version >/dev/null 2>&1; then
  SED_INPLACE=(-i)
else
  SED_INPLACE=(-i "")
fi

sub() {
  local file="$1" pattern="$2" replacement="$3"
  sed "${SED_INPLACE[@]}" -E "s|${pattern}|${replacement}|g" "$file"
}

# Collect candidate files.
FILES=()
while IFS= read -r line; do FILES+=("$line"); done < <(find src -type f \( -name "*.jsx" -o -name "*.js" \))

for f in "${FILES[@]}"; do
  if is_skip "$f"; then
    continue
  fi

  # === Backgrounds ===
  # Darkest surfaces (app body, deepest panels) -> paper
  sub "$f" '\[#0e0e0e\]' 'paper'
  sub "$f" '\[#111\]' 'paper'
  sub "$f" '\[#111111\]' 'paper'
  sub "$f" '\[#141414\]' 'paper'
  sub "$f" '\[#1c1c1c\]' 'paper'

  # Mid-dark surfaces (cards, insets, hover) -> paper-warm
  sub "$f" '\[#161616\]' 'paper-warm'
  sub "$f" '\[#1a1a1a\]' 'paper-warm'
  sub "$f" '\[#1e1e1e\]' 'paper-warm'
  sub "$f" '\[#222\]' 'paper-warm'
  sub "$f" '\[#222222\]' 'paper-warm'
  sub "$f" '\[#252525\]' 'paper-warm'
  sub "$f" '\[#2a2a2a\]' 'paper-warm'
  sub "$f" '\[#282828\]' 'paper-warm'

  # Borders and hovered-card surfaces -> muted (for bg) or hairline (for border)
  # Process bg- first, then border-, so we can distinguish.
  sed "${SED_INPLACE[@]}" -E "s|bg-\[#2e2e2e\]|bg-muted|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|bg-\[#333333?\]|bg-muted|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|bg-\[#3a3a3a\]|bg-muted|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|bg-\[#3b3b3b\]|bg-muted|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|bg-\[#444444?\]|bg-muted|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|bg-\[#555\]|bg-muted|g" "$f"

  sed "${SED_INPLACE[@]}" -E "s|border-\[#1a1a1a\]|border-hairline|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|border-\[#222\]|border-hairline|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|border-\[#2a2a2a\]|border-hairline|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|border-\[#2e2e2e\]|border-hairline|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|border-\[#333333?\]|border-hairline|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|border-\[#3a3a3a\]|border-hairline|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|border-\[#444\]|border-hairline|g" "$f"

  # === Text grays — ink / ink-soft ===
  # Lightest text on dark (gray-200/300) -> ink (darkest in light, lightest in dark)
  sed "${SED_INPLACE[@]}" -E "s|text-gray-200|text-ink|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|text-gray-300|text-ink|g" "$f"
  # Mid grays -> ink-soft
  sed "${SED_INPLACE[@]}" -E "s|text-gray-400|text-ink-soft|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|text-gray-500|text-ink-soft|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|text-gray-600|text-ink-soft|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|text-gray-700|text-ink|g" "$f"

  # Hover variants
  sed "${SED_INPLACE[@]}" -E "s|hover:text-gray-200|hover:text-ink|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|hover:text-gray-300|hover:text-ink|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|hover:text-gray-400|hover:text-ink-soft|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|hover:text-gray-500|hover:text-ink-soft|g" "$f"

  # Backgrounds: bg-black/ink, bg-white kept as-is for google branding
  sed "${SED_INPLACE[@]}" -E "s|bg-black/([0-9]+)|bg-ink/\1|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|text-black\b|text-ink|g" "$f"

  # Hover gray backgrounds
  sed "${SED_INPLACE[@]}" -E "s|hover:bg-gray-100|hover:bg-muted|g" "$f"

  # Radius normalization — the naqsheh is square; large radii become
  # medium/small. Leave rounded-full alone (avatars). rounded / rounded-md
  # default to xs; rounded-lg to sm; rounded-xl to md.
  sed "${SED_INPLACE[@]}" -E "s|rounded-xl\b|rounded-md|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|rounded-lg\b|rounded-sm|g" "$f"
  sed "${SED_INPLACE[@]}" -E "s|rounded-md\b|rounded-xs|g" "$f"
  # (Bare `rounded` is left at tailwind default 4px — close enough to
  # naqsheh square-ish aesthetic; safer than regex-walking word boundaries
  # in BSD sed.)

done

echo "Migration pass complete."
