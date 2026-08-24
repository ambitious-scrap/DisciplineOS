# DisciplineOS — macOS Recovery Guide

This document defines the safe, deliberate recovery procedure for DisciplineOS on macOS. DisciplineOS enforces discipline without ever using unrecoverable random passwords or destructive locking.

---

## 1. Fast Emergency Recovery (via Script)

To instantly deactivate macOS enforcement, restore default `/etc/hosts`, and stop the helper daemon:

```bash
sudo /Users/dinesh/Documents/Projects/DiscplineOS/macos/scripts/emergency-recovery.sh
```

---

## 2. Manual Step-by-Step Recovery

If running manually in Terminal:

1. **Stop the LaunchDaemon Helper:**
   ```bash
   sudo launchctl bootout system/com.disciplineos.helper || sudo killall DisciplineHelperDaemon
   ```

2. **Clean `/etc/hosts`:**
   Remove the `# DisciplineOS Block List` section from `/etc/hosts`:
   ```bash
   sudo sed -i '' '/# DisciplineOS Block List/,+20d' /etc/hosts
   sudo dscacheutil -flushcache; sudo killall -HUP mDNSResponder
   ```

3. **Disable Browser Extension:**
   - Chrome: Navigate to `chrome://extensions` and toggle off **DisciplineOS Focus Shield**.
   - Safari: Settings $\to$ Extensions $\to$ Uncheck **DisciplineOS**.

---

## 3. Recovery Invariants

- **No Root Lockout:** The system will never lock root administrative access or prevent `sudo` command execution.
- **Explainable Bypass Logging:** All manual overrides and emergency unlocks are recorded in the central audit ledger for accountability.
