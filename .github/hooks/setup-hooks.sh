#!/bin/bash
# Setup script for git hooks
# 
# Usage: bash .github/hooks/setup-hooks.sh
# This script will install all available hooks into your local .git/hooks directory

set -e

HOOKS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GIT_HOOKS_DIR="$(git rev-parse --show-toplevel)/.git/hooks"

echo "🔧 Setting up git hooks..."
echo ""

# Create hooks directory if it doesn't exist
mkdir -p "$GIT_HOOKS_DIR"

# List of hooks to install
HOOKS=(
    "pre-commit"
)

installed_count=0

for hook in "${HOOKS[@]}"; do
    HOOK_SOURCE="$HOOKS_DIR/$hook"
    HOOK_DEST="$GIT_HOOKS_DIR/$hook"
    
    if [ ! -f "$HOOK_SOURCE" ]; then
        echo "⚠️  Hook not found: $hook"
        continue
    fi
    
    # Remove existing hook if it's a symlink
    if [ -L "$HOOK_DEST" ]; then
        rm "$HOOK_DEST"
        echo "✓ Removed old hook: $hook"
    fi
    
    # Create symlink
    ln -s "$HOOK_SOURCE" "$HOOK_DEST"
    chmod +x "$HOOK_DEST"
    
    echo "✓ Installed hook: $hook"
    ((installed_count++))
done

echo ""
echo "✅ Setup complete! Installed $installed_count hook(s)"
echo ""
echo "Hooks are now active. They will run automatically before commits."
echo "To bypass a hook, use: git commit --no-verify"
echo ""
