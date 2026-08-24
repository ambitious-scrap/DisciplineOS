#!/usr/bin/env bash
# DisciplineOS — macOS Safe Recovery & Deactivation Script

echo "🛡️ DisciplineOS Recovery Utility"
echo "--------------------------------"

# 1. Unload LaunchDaemon if active
if sudo launchctl list | grep -q "com.disciplineos.helper"; then
    echo "Stopping DisciplineOS LaunchDaemon..."
    sudo launchctl bootout system/com.disciplineos.helper 2>/dev/null || true
fi

# 2. Kill any running helper processes
sudo killall DisciplineHelperDaemon 2>/dev/null || true

# 3. Clean hosts entries
if grep -q "# DisciplineOS Block List" /etc/hosts; then
    echo "Cleaning /etc/hosts entries..."
    sudo sed -i '' '/# DisciplineOS Block List/,+50d' /etc/hosts
    sudo dscacheutil -flushcache
    sudo killall -HUP mDNSResponder 2>/dev/null || true
fi

echo "✅ DisciplineOS enforcement deactivated. Normal network and application access restored."
