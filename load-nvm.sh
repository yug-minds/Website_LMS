#!/bin/bash
# Quick script to load nvm and npm in current terminal session

export NVM_DIR="$HOME/.nvm"
[ -s "$NVM_DIR/nvm.sh" ] && \. "$NVM_DIR/nvm.sh"
[ -s "$NVM_DIR/nvm.sh" ] && nvm use --lts --silent

echo "✅ nvm and npm are now available in this terminal session"
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"
