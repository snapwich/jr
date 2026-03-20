
_default:
  just --list

# Fetch latest ticket script from upstream
sync-ticket:
  mkdir -p ticket
  curl -s -o ticket/ticket https://raw.githubusercontent.com/snapwich/ticket/master/ticket
  curl -s -o ticket/LICENSE https://raw.githubusercontent.com/snapwich/ticket/master/LICENSE
  chmod +x ticket/ticket

init dir mode="":
  #!/usr/bin/env bash
  set -euo pipefail
  dir="{{ dir }}"
  mode="{{ mode }}"

  # Create .jr directory structure
  mkdir -p "$dir/.jr/.tickets" "$dir/.jr/plans"

  # Create project-level claude extension structure
  mkdir -p "$dir/.jr/claude/_/agents/tk"
  mkdir -p "$dir/.jr/claude/_/prompts/tk"
  mkdir -p "$dir/.jr/claude/_/rules"

  # Copy README explaining the extension pattern
  cp "$(dirname "{{ justfile() }}")/templates/claude-extensions-readme.md" "$dir/.jr/claude/README.md"

  # Initialize git repo for .jr
  git -C "$dir/.jr" init

  # Ensure .claude/ is a real directory before stow (prevents tree folding).
  # On re-init, .claude may be a stow-folded symlink — unstow first.
  if [[ -L "$dir/.claude" ]]; then
    stow -D -t "$dir" claude
  fi
  mkdir -p "$dir/.claude/rules/tk"

  # Stow agent configs and scripts
  stow -t "$dir" claude scripts

  # Symlink bundled ticket script
  mkdir -p "$dir/.jr/ticket"
  ln -sf "$(realpath ticket/ticket)" "$dir/.jr/ticket/ticket"
  ln -sf "$(realpath ticket/LICENSE)" "$dir/.jr/ticket/LICENSE"

  # Copy linting config (not symlinked — avoids breakage if .jr repo moves)
  cp .prettierrc.yml "$dir/.jr/"
  cp .markdownlint.yaml "$dir/.jr/"

  # Generate package.json if absent (versions pulled from this repo's package.json)
  if [[ ! -f "$dir/.jr/package.json" ]]; then
    project_name="$(basename "$(cd "$dir" && pwd)")"
    v_lintstaged="$(jq -r '.devDependencies["lint-staged"]' package.json)"
    v_mdlint="$(jq -r '.devDependencies["markdownlint-cli2"]' package.json)"
    v_prettier="$(jq -r '.devDependencies["prettier"]' package.json)"
    cat > "$dir/.jr/package.json" <<PKGJSON
  {
    "name": "${project_name}-jr",
    "private": true,
    "devDependencies": {
      "lint-staged": "${v_lintstaged}",
      "markdownlint-cli2": "${v_mdlint}",
      "prettier": "${v_prettier}"
    },
    "lint-staged": {
      "*.{md,mdx}": [
        "prettier --write",
        "markdownlint-cli2 --fix"
      ]
    }
  }
  PKGJSON
  fi

  # Ensure .gitignore has node_modules/, tmp/, and ticket/
  if ! grep -q '^node_modules/$' "$dir/.jr/.gitignore" 2>/dev/null; then
    echo 'node_modules/' >> "$dir/.jr/.gitignore"
  fi
  if ! grep -q '^tmp/$' "$dir/.jr/.gitignore" 2>/dev/null; then
    echo 'tmp/' >> "$dir/.jr/.gitignore"
  fi
  if ! grep -q '^ticket/$' "$dir/.jr/.gitignore" 2>/dev/null; then
    echo 'ticket/' >> "$dir/.jr/.gitignore"
  fi

  # Install pre-commit hook (direct, no husky dependency)
  mkdir -p "$dir/.jr/.git/hooks"
  cat > "$dir/.jr/.git/hooks/pre-commit" <<'HOOK'
  #!/bin/sh
  npx lint-staged
  HOOK
  chmod +x "$dir/.jr/.git/hooks/pre-commit"

  # Detect project mode and generate structure rule
  if [[ -z "$mode" ]]; then
    if compgen -G "$dir/*/default" > /dev/null 2>&1; then
      mode="multi"
    else
      mode="single"
    fi
  fi
  jr_dir="$(dirname "{{ justfile() }}")"
  cp "$jr_dir/templates/project-context-${mode}.md" "$dir/.claude/rules/tk/structure.md"

  # Install dependencies
  (cd "$dir/.jr" && pnpm install)

test:
  pnpm test
