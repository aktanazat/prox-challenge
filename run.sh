#!/usr/bin/env bash
# Vulcan OmniPro 220 agent: setup + run.
#   cp .env.example .env   # add your ANTHROPIC_API_KEY (or skip it if
#                           # `claude` is already logged in locally)
#   ./run.sh                -> http://localhost:8317
set -euo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")"

if [ ! -f .env ]; then
  echo "vulcan-agent: no .env found. Run: cp .env.example .env   (then add your key)" >&2
  exit 1
fi
if grep -qE '^ANTHROPIC_API_KEY=(your-api-key-here)?$' .env; then
  echo "vulcan-agent: .env has no real ANTHROPIC_API_KEY set." >&2
  echo "  Either fill it in, or leave it unset — the backend falls back to a local" >&2
  echo "  'claude' CLI login (run 'claude auth' once) if no key is present." >&2
fi

if ! command -v cargo >/dev/null 2>&1; then
  echo "vulcan-agent: cargo not found. Install Rust: https://rustup.rs" >&2
  exit 1
fi

npm install --no-fund --no-audit

exec cargo run --release --manifest-path server/Cargo.toml
