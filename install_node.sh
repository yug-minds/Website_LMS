#!/bin/bash

echo "========================================="
echo "Node.js Installation Script for macOS"
echo "========================================="
echo ""

# Check if Node.js is already installed
if command -v node &> /dev/null; then
    echo "✅ Node.js is already installed!"
    node --version
    npm --version
    exit 0
fi

echo "Node.js is not installed."
echo ""
echo "Choose an installation method:"
echo "1. Install Homebrew + Node.js (Recommended)"
echo "2. Download Node.js installer (Easiest - manual)"
echo ""
read -p "Enter choice (1 or 2): " choice

case $choice in
    1)
        echo ""
        echo "Installing Homebrew..."
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        
        # Add Homebrew to PATH
        if [ -f "/opt/homebrew/bin/brew" ]; then
            echo 'eval "$(/opt/homebrew/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -f "/usr/local/bin/brew" ]; then
            echo 'eval "$(/usr/local/bin/brew shellenv)"' >> ~/.zprofile
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        
        echo ""
        echo "Installing Node.js..."
        brew install node
        
        echo ""
        echo "✅ Installation complete!"
        node --version
        npm --version
        ;;
    2)
        echo ""
        echo "Please download and install Node.js from:"
        echo "https://nodejs.org/"
        echo ""
        echo "After installation, run this script again to verify."
        ;;
    *)
        echo "Invalid choice. Please run the script again."
        exit 1
        ;;
esac
