
_default:
  just --list

init dir:
  #!/usr/bin/env bash
  set -euo pipefail
  dir="{{ dir }}"

  # Create .agents directory structure
  mkdir -p "$dir/.agents/.tickets" "$dir/.agents/plans"

  # Create project-level claude extension structure
  mkdir -p "$dir/.agents/claude/_/agents/tk"
  mkdir -p "$dir/.agents/claude/_/commands/tk"
  mkdir -p "$dir/.agents/claude/_/rules"

  # Copy README explaining the extension pattern
  cp "$(dirname "{{ justfile() }}")/templates/claude-extensions-readme.md" "$dir/.agents/claude/README.md"

  # Initialize git repo for .agents
  git -C "$dir/.agents" init

  # Stow agent configs and scripts
  stow -t "$dir" claude scripts

  # Copy linting config (not symlinked — avoids breakage if .agents repo moves)
  cp .prettierrc.yml "$dir/.agents/"
  cp .markdownlint.yaml "$dir/.agents/"

  # Create .tickets symlink
  ln -snf .agents/.tickets "$dir/.tickets"

  # Generate package.json if absent (versions pulled from this repo's package.json)
  if [[ ! -f "$dir/.agents/package.json" ]]; then
    project_name="$(basename "$(cd "$dir" && pwd)")"
    v_lintstaged="$(jq -r '.devDependencies["lint-staged"]' package.json)"
    v_mdlint="$(jq -r '.devDependencies["markdownlint-cli2"]' package.json)"
    v_prettier="$(jq -r '.devDependencies["prettier"]' package.json)"
    cat > "$dir/.agents/package.json" <<PKGJSON
  {
    "name": "${project_name}-dotagents",
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

  # Ensure .gitignore has node_modules/ and tmp/
  if ! grep -q '^node_modules/$' "$dir/.agents/.gitignore" 2>/dev/null; then
    echo 'node_modules/' >> "$dir/.agents/.gitignore"
  fi
  if ! grep -q '^tmp/$' "$dir/.agents/.gitignore" 2>/dev/null; then
    echo 'tmp/' >> "$dir/.agents/.gitignore"
  fi

  # Install pre-commit hook (direct, no husky dependency)
  mkdir -p "$dir/.agents/.git/hooks"
  cat > "$dir/.agents/.git/hooks/pre-commit" <<'HOOK'
  #!/bin/sh
  npx lint-staged
  HOOK
  chmod +x "$dir/.agents/.git/hooks/pre-commit"

  # Install dependencies
  (cd "$dir/.agents" && pnpm install)

test:
  pnpm test
