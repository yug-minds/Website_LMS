#!/bin/bash
# Quick Node.js installation script

echo "🚀 Installing Node.js..."

# Install Homebrew if not installed
if ! command -v brew &> /dev/null; then
    echo "📦 Installing Homebrew..."
    /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
    
    # Add to PATH
    if [ -d "/opt/homebrew" ]; then
        echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
        eval "$(/opt/homebrew/bin/brew shellenv)"
    fi
fi

# Install Node.js
echo "📦 Installing Node.js..."
brew install node

# Verify
echo ""
echo "✅ Installation complete!"
echo "Node version: $(node --version)"
echo "npm version: $(npm --version)"
