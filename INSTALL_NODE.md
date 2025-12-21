# Installing Node.js on macOS

Node.js is not currently installed on your system. Here are the easiest ways to install it:

## Option 1: Install Node.js directly (Recommended - Easiest)

1. **Download Node.js installer:**
   - Go to: https://nodejs.org/
   - Download the LTS (Long Term Support) version for macOS
   - Run the installer and follow the instructions

2. **Verify installation:**
   ```bash
   node --version
   npm --version
   ```

## Option 2: Install using Homebrew (If you have Homebrew)

1. **Install Homebrew (if not installed):**
   ```bash
   /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
   ```

2. **Install Node.js:**
   ```bash
   brew install node
   ```

3. **Verify installation:**
   ```bash
   node --version
   npm --version
   ```

## Option 3: Install using nvm (Node Version Manager) - For managing multiple Node versions

1. **Install nvm:**
   ```bash
   curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
   ```

2. **Reload your shell:**
   ```bash
   source ~/.zshrc
   ```

3. **Install Node.js:**
   ```bash
   nvm install --lts
   nvm use --lts
   ```

4. **Verify installation:**
   ```bash
   node --version
   npm --version
   ```

## After Installation

Once Node.js is installed, you can run:

```bash
cd /Users/likithkarnekota/Website_LMS
npm install
npm run dev
```

The development server will start at: http://localhost:3000

