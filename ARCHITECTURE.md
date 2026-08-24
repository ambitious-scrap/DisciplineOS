# DisciplineOS — Full System Architecture

> **Decisions locked:** Lockdown mode, sideloaded APK, instant-unlock with 3x penalty.  
> **Related specification:** [`FINAL-PRODUCT-SPEC.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/FINAL-PRODUCT-SPEC.md)  
> **Related build plan:** [`BUILD-PLAN.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/BUILD-PLAN.md)  
> **Related engineering guidelines:** [`AGENTS.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/AGENTS.md)

---

## 1. System Overview

DisciplineOS is a 4-component distributed system that enforces app/website restrictions across your Android phone, Android tablet, and MacBook Air, rewarding productive behavior with earned distraction time.

```
                        ┌────────────────────────────┐
                        │      CENTRAL SERVER         │
                        │  Hono + PostgreSQL + WS     │
                        │  (Fly.io / Railway / VPS)   │
                        └──┬──────────┬───────────┬───┘
                           │          │           │
              HTTPS/WS     │          │           │    HTTPS/WS
         ┌─────────────────┘          │           └──────────────────┐
         │                            │                              │
┌────────▼─────────┐      ┌───────────▼──────────┐     ┌────────────▼───────┐
│  Android App     │      │  Android App          │     │  macOS Agent       │
│  (Phone)         │      │  (Tablet)             │     │  (MacBook Air)     │
│                  │      │                       │     │                    │
│ • DeviceAdmin    │      │ • DeviceAdmin         │     │ • LaunchDaemon     │
│ • Foreground Svc │      │ • Foreground Svc      │     │   (root enforcer)  │
│ • VPN DNS Filter │      │ • VPN DNS Filter      │     │ • Menu Bar Agent   │
│ • Geofencing     │      │ • Overlay Blocker     │     │ • /etc/hosts block │
│ • Overlay Blocker│      │                       │     │ • App Interceptor  │
│ • Step Counter   │      │                       │     │ • Browser Extension│
└──────────────────┘      └───────────────────────┘     └────────────────────┘
```

---

## 2. Central Server

### Tech Stack
| Layer | Technology | Reason |
|-------|-----------|--------|
| Runtime | Node.js 20+ / Bun | TypeScript end-to-end |
| Framework | Hono | Lightweight, runs on edge + Node |
| Database | PostgreSQL (Neon free tier) | ACID, free, reliable |
| ORM | Drizzle | Type-safe, lightweight |
| Auth | JWT (access + refresh) | Stateless, cross-device |
| Real-time | WebSocket (ws) | Instant sync across devices |
| Push | FCM (Android) + APNs (macOS) | Wake sleeping devices |
| Hosting | Fly.io (free 3 VMs) | Global, always-on |

### Database Schema

```sql
-- Users
CREATE TABLE users (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email        TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Devices
CREATE TABLE devices (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) NOT NULL,
  name         TEXT NOT NULL,                    -- "Pixel 8", "MacBook Air"
  platform     TEXT NOT NULL CHECK (platform IN ('android', 'macos')),
  push_token   TEXT,
  last_seen    TIMESTAMPTZ DEFAULT now(),
  is_locked    BOOLEAN DEFAULT true,             -- whether enforcement is active
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Time Bank (single row per user, updated atomically)
CREATE TABLE time_bank (
  user_id         UUID PRIMARY KEY REFERENCES users(id),
  balance_seconds INTEGER NOT NULL DEFAULT 0 CHECK (balance_seconds >= 0),
  max_seconds     INTEGER NOT NULL DEFAULT 14400,  -- 4 hour cap
  last_decay_at   TIMESTAMPTZ DEFAULT now(),
  updated_at      TIMESTAMPTZ DEFAULT now()
);

-- Transactions (immutable ledger)
CREATE TABLE transactions (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) NOT NULL,
  type         TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
  source       TEXT NOT NULL,                    -- 'task', 'gym', 'outdoor', 'steps', 'usage', 'decay', 'emergency'
  seconds      INTEGER NOT NULL,
  description  TEXT,
  device_id    UUID REFERENCES devices(id),
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Tasks
CREATE TABLE tasks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) NOT NULL,
  title           TEXT NOT NULL,
  description     TEXT,
  reward_seconds  INTEGER NOT NULL DEFAULT 900,  -- 15 min default
  is_recurring    BOOLEAN DEFAULT false,
  recurrence_cron TEXT,                          -- e.g., "0 9 * * *" for daily 9am
  completed_at    TIMESTAMPTZ,
  next_due_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Blocked Apps
CREATE TABLE blocked_apps (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) NOT NULL,
  platform        TEXT NOT NULL,
  identifier      TEXT NOT NULL,                 -- 'com.instagram.android' or 'com.apple.Safari'
  display_name    TEXT NOT NULL,                 -- 'Instagram'
  is_active       BOOLEAN DEFAULT true,
  UNIQUE (user_id, platform, identifier)
);

-- Blocked Websites (cross-platform)
CREATE TABLE blocked_sites (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES users(id) NOT NULL,
  domain     TEXT NOT NULL,                      -- 'reddit.com' (matches *.reddit.com too)
  is_active  BOOLEAN DEFAULT true,
  UNIQUE (user_id, domain)
);

-- Locations (geofences)
CREATE TABLE locations (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) NOT NULL,
  name         TEXT NOT NULL,                    -- 'home', 'gym', 'office'
  type         TEXT NOT NULL CHECK (type IN ('home', 'gym', 'reward_zone', 'custom')),
  latitude     DOUBLE PRECISION NOT NULL,
  longitude    DOUBLE PRECISION NOT NULL,
  radius_meters INTEGER NOT NULL DEFAULT 100,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Location Events (from geofencing)
CREATE TABLE location_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) NOT NULL,
  location_id  UUID REFERENCES locations(id) NOT NULL,
  device_id    UUID REFERENCES devices(id) NOT NULL,
  event_type   TEXT NOT NULL CHECK (event_type IN ('enter', 'exit', 'dwell')),
  timestamp    TIMESTAMPTZ NOT NULL,
  created_at   TIMESTAMPTZ DEFAULT now()
);

-- Reward Rules
CREATE TABLE reward_rules (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             UUID REFERENCES users(id) NOT NULL,
  trigger_type        TEXT NOT NULL,               -- 'gym_visit', 'outdoor', 'steps', 'task_complete'
  min_duration_seconds INTEGER,                    -- e.g., 1800 for 30 min gym
  reward_seconds      INTEGER NOT NULL,            -- e.g., 3600 for 60 min earned
  cooldown_seconds    INTEGER DEFAULT 0,           -- prevent spamming (e.g., only 1 gym reward per day)
  step_threshold      INTEGER,                     -- for step-based rewards
  is_active           BOOLEAN DEFAULT true
);

-- Active Unlocks (currently unlocked apps/sites with countdown)
CREATE TABLE active_unlocks (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID REFERENCES users(id) NOT NULL,
  unlock_type     TEXT NOT NULL CHECK (unlock_type IN ('app', 'site')),
  identifier      TEXT NOT NULL,                  -- app package or domain
  expires_at      TIMESTAMPTZ NOT NULL,
  is_emergency    BOOLEAN DEFAULT false,
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Bypass Attempts Log (accountability)
CREATE TABLE bypass_attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES users(id) NOT NULL,
  device_id   UUID REFERENCES devices(id) NOT NULL,
  attempt_type TEXT NOT NULL,                     -- 'vpn_disconnect', 'admin_deactivate', 'hosts_tamper', etc.
  details     JSONB,
  created_at  TIMESTAMPTZ DEFAULT now()
);

-- macOS Lockdown State
CREATE TABLE macos_lockdown (
  user_id           UUID PRIMARY KEY REFERENCES users(id),
  admin_password_hash TEXT,                       -- randomized admin password (encrypted)
  password_salt     TEXT,
  is_locked         BOOLEAN DEFAULT false,
  emergency_unlock_at TIMESTAMPTZ                 -- when emergency unlock becomes available
);
```

### API Routes

```
Authentication:
  POST   /api/auth/register          → Create account
  POST   /api/auth/login             → Get JWT tokens
  POST   /api/auth/refresh           → Refresh access token

Time Bank:
  GET    /api/bank                   → { balance_seconds, max_seconds }
  POST   /api/bank/spend             → { seconds, source, identifier }
                                        Returns { approved, new_balance, unlock_expires_at }
                                        Emergency: seconds × 3
  POST   /api/bank/earn              → (internal, from location/task handlers)

Tasks:
  GET    /api/tasks                  → List active tasks
  POST   /api/tasks                  → Create task
  PATCH  /api/tasks/:id              → Update task
  POST   /api/tasks/:id/complete     → Mark done → credits time bank
  DELETE /api/tasks/:id              → Remove task

Blocking:
  GET    /api/blocked/apps           → ?platform=android|macos
  POST   /api/blocked/apps           → Add blocked app
  DELETE /api/blocked/apps/:id       → Remove
  GET    /api/blocked/sites          → All blocked domains
  POST   /api/blocked/sites          → Add domain
  DELETE /api/blocked/sites/:id      → Remove
  GET    /api/blocked/active-unlocks → Currently unlocked items

Location:
  GET    /api/locations              → List geofences
  POST   /api/locations              → Add geofence
  PUT    /api/locations/:id          → Update
  DELETE /api/locations/:id          → Remove
  POST   /api/location-events        → Report geofence event (from device)

Devices:
  POST   /api/devices/register       → Register device
  GET    /api/devices                → List devices
  PUT    /api/devices/:id            → Update push token
  DELETE /api/devices/:id            → Remove device

Reward Rules:
  GET    /api/rules                  → List rules
  POST   /api/rules                  → Create rule
  PUT    /api/rules/:id              → Update
  DELETE /api/rules/:id              → Remove

Lockdown (macOS specific):
  POST   /api/lockdown/enable        → Randomize admin password, store hash
  POST   /api/lockdown/emergency     → Request emergency unlock
  GET    /api/lockdown/status        → Current lockdown state

Sync (WebSocket):
  WS     /api/sync                   → Real-time events:
                                        - balance_changed
                                        - unlock_granted
                                        - unlock_expired
                                        - blocked_list_updated
                                        - emergency_available

Stats:
  GET    /api/stats/daily            → ?days=7  Daily earn/spend breakdown
  GET    /api/stats/streaks          → Current streaks
  GET    /api/stats/bypass-attempts  → Logged bypass attempts
```

---

## 3. Android App (Phone + Tablet)

### Architecture

```
┌─────────────────────────────────────────────────────────┐
│                     Android App                          │
│                                                          │
│  ┌─────────────────┐  ┌──────────────────────────────┐  │
│  │ UI Layer         │  │ Foreground Service            │  │
│  │ (Jetpack Compose)│  │ (always running)              │  │
│  │                  │  │                                │  │
│  │ • Dashboard      │  │ ┌────────────────────────┐    │  │
│  │ • Tasks          │  │ │ AppMonitor             │    │  │
│  │ • Settings       │  │ │ UsageStatsManager poll │    │  │
│  │ • Stats          │  │ │ → detect foreground app│    │  │
│  │                  │  │ │ → overlay or go home   │    │  │
│  │                  │  │ └────────────────────────┘    │  │
│  │                  │  │ ┌────────────────────────┐    │  │
│  │                  │  │ │ DnsVpnService          │    │  │
│  │                  │  │ │ VpnService subclass     │    │  │
│  │                  │  │ │ → intercept DNS queries │    │  │
│  │                  │  │ │ → block listed domains  │    │  │
│  │                  │  │ └────────────────────────┘    │  │
│  │                  │  │ ┌────────────────────────┐    │  │
│  │                  │  │ │ GeofenceReceiver       │    │  │
│  │                  │  │ │ BroadcastReceiver       │    │  │
│  │                  │  │ │ → gym enter/exit/dwell  │    │  │
│  │                  │  │ │ → home exit/enter       │    │  │
│  │                  │  │ │ → report to server      │    │  │
│  │                  │  │ └────────────────────────┘    │  │
│  │                  │  │ ┌────────────────────────┐    │  │
│  │                  │  │ │ ServerSync             │    │  │
│  │                  │  │ │ WebSocket + REST        │    │  │
│  │                  │  │ │ → sync time bank        │    │  │
│  │                  │  │ │ → push blocked lists    │    │  │
│  │                  │  │ │ → unlock notifications  │    │  │
│  │                  │  │ └────────────────────────┘    │  │
│  └─────────────────┘  └──────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ DeviceAdminReceiver                                │  │
│  │ → Prevents uninstall                               │  │
│  │ → Detects deactivation attempts → logs to server   │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ BootReceiver                                       │  │
│  │ → Starts foreground service on device boot         │  │
│  └───────────────────────────────────────────────────┘  │
│                                                          │
│  ┌───────────────────────────────────────────────────┐  │
│  │ AccessibilityService (backup enforcement)          │  │
│  │ → Detects blocked app window events                │  │
│  │ → Performs GLOBAL_ACTION_HOME if overlay bypassed   │  │
│  └───────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

### Permissions Required

```xml
<!-- App usage monitoring -->
<uses-permission android:name="android.permission.PACKAGE_USAGE_STATS" />

<!-- Overlay for blocking screen -->
<uses-permission android:name="android.permission.SYSTEM_ALERT_WINDOW" />

<!-- Foreground service (always running) -->
<uses-permission android:name="android.permission.FOREGROUND_SERVICE" />
<uses-permission android:name="android.permission.FOREGROUND_SERVICE_SPECIAL_USE" />

<!-- VPN for DNS filtering -->
<uses-permission android:name="android.permission.BIND_VPN_SERVICE" />

<!-- Location for geofencing -->
<uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />
<uses-permission android:name="android.permission.ACCESS_BACKGROUND_LOCATION" />

<!-- Boot receiver -->
<uses-permission android:name="android.permission.RECEIVE_BOOT_COMPLETED" />

<!-- Network state -->
<uses-permission android:name="android.permission.INTERNET" />
<uses-permission android:name="android.permission.ACCESS_NETWORK_STATE" />

<!-- Step counter (bonus rewards) -->
<uses-permission android:name="android.permission.ACTIVITY_RECOGNITION" />

<!-- Accessibility service (declared in service, not permission) -->
<!-- Device Admin (declared in receiver) -->
```

### App Blocking Flow

```
Every 500ms:
  1. UsageStatsManager.queryUsageStats() → get current foreground app
  2. Check against local blocked_apps cache (synced from server)
  3. Check active_unlocks for this app
  
  IF blocked AND NOT unlocked:
    → Show fullscreen overlay activity:
      "🔒 Instagram is blocked"
      "You have 47 minutes in your time bank"
      [Unlock for 15 min (costs 15 min)]
      [Unlock for 30 min (costs 30 min)]
      [Emergency Unlock 5 min (costs 15 min)]  ← 3x penalty
      [Go Back]
    
    IF user taps unlock:
      → POST /api/bank/spend { seconds: 900, identifier: "com.instagram.android" }
      → Server deducts from bank, creates active_unlock row
      → WebSocket broadcasts unlock to all devices
      → Overlay dismisses, app becomes usable
      → Timer starts (on server, authoritative)
    
    IF user taps Go Back:
      → Navigate to home screen
  
  IF blocked AND unlock EXPIRED:
    → Re-show overlay immediately
    → Perform GLOBAL_ACTION_HOME via AccessibilityService as backup

  IF NOT blocked OR actively unlocked:
    → Do nothing
```

### DNS VPN Blocking Flow

```
VpnService subclass:
  1. Create TUN interface
  2. Route all traffic through TUN
  3. Read packets from TUN file descriptor
  4. For DNS packets (port 53):
     - Parse domain name from query
     - Check against blocked_sites list
     - IF blocked: return A record pointing to 127.0.0.1
     - IF NOT blocked: forward to real DNS (e.g., 8.8.8.8)
  5. For non-DNS packets:
     - Forward directly (no inspection needed for website blocking)

Anti-disconnect:
  - Service runs with START_STICKY
  - If VPN disconnects:
    → Log bypass attempt to server
    → Show persistent notification: "⚠️ Protection disabled"
    → In LOCKDOWN mode: Block ALL network traffic until VPN reconnects
      (achieved by keeping TUN interface but dropping all packets)
```

### Geofencing Implementation

```
On setup:
  1. User sets HOME location (lat/lng from current position or map)
  2. User sets GYM location
  3. Register geofences with Google Geofencing API:
     - HOME: radius 150m, monitor EXIT and ENTER
     - GYM: radius 100m, monitor ENTER, EXIT, DWELL (30 min)

GeofenceBroadcastReceiver:
  ON GYM ENTER:
    → Record gym_entry_time
    → POST /api/location-events { location_id, event_type: "enter" }
  
  ON GYM DWELL (30 min):
    → POST /api/location-events { location_id, event_type: "dwell" }
    → Server calculates reward based on rules
    → Time bank credited
    → Push notification: "💪 Gym reward: +60 min earned!"
  
  ON GYM EXIT:
    → Calculate total gym time = now - gym_entry_time
    → POST /api/location-events { location_id, event_type: "exit" }
    → Server may grant additional reward for >60 min sessions
  
  ON HOME EXIT:
    → Record home_exit_time
    → Start timer
    → POST /api/location-events { location_id, event_type: "exit" }
  
  ON HOME ENTER (returning):
    → Calculate outdoor_time = now - home_exit_time
    → POST /api/location-events { location_id, event_type: "enter" }
    → Server rewards based on outdoor duration:
      ≥ 15 min → 15 min reward
      ≥ 30 min → 30 min reward
      ≥ 60 min → 45 min reward
      ≥ 120 min → 90 min reward
```

### Lockdown Features (Android)

```
DeviceAdminReceiver:
  - onDisableRequested(): 
    → Log bypass attempt to server
    → Show warning: "Disabling protection will be logged"
    → In strict lockdown: refuse (return warning message)

Prevent uninstall:
  - DevicePolicyManager.setUninstallBlocked(component, "com.disciplineos", true)
  - App cannot be uninstalled while Device Admin is active
  - Deactivating Device Admin requires deliberate action + is logged

Always-on VPN:
  - DevicePolicyManager.setAlwaysOnVpnPackage(component, "com.disciplineos", true)
  - Sets lockdown mode: NO traffic without VPN
  - Even if user force-stops the app, network dies

Anti-tampering:
  - Watchdog timer every 10s: verify VPN is active, service is running
  - If anything is wrong: re-start services, notify server
  - Battery optimization exclusion requested during setup
```

---

## 4. macOS Agent (MacBook Air)

### Architecture

```
┌──────────────────────────────────────────────────────────┐
│                    macOS System                            │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ LaunchDaemon (runs as root)                         │   │
│  │ com.disciplineos.daemon                             │   │
│  │ /Library/LaunchDaemons/com.disciplineos.daemon.plist│   │
│  │                                                      │   │
│  │ Responsibilities:                                    │   │
│  │ • Own /etc/hosts → write blocked domains             │   │
│  │ • Watch /etc/hosts for tampering → restore           │   │
│  │ • Flush DNS cache after changes                      │   │
│  │ • Kill blocked app processes                         │   │
│  │ • Manage admin password (lockdown mode)              │   │
│  │ • Cannot be stopped by non-root user                 │   │
│  │ • Starts on boot (RunAtLoad + KeepAlive)             │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ LaunchAgent (runs as user)                          │   │
│  │ com.disciplineos.agent                              │   │
│  │ ~/Library/LaunchAgents/com.disciplineos.agent.plist  │   │
│  │                                                      │   │
│  │ Responsibilities:                                    │   │
│  │ • Menu bar icon with time bank balance               │   │
│  │ • NSWorkspace app launch monitoring                  │   │
│  │ • Overlay/notification when blocked app detected     │   │
│  │ • WebSocket sync with server                         │   │
│  │ • Task management UI (click menu bar → popover)      │   │
│  │ • Communicates with daemon via Unix socket           │   │
│  └────────────────────────────────────────────────────┘   │
│                                                            │
│  ┌────────────────────────────────────────────────────┐   │
│  │ Browser Extension (Chrome + Firefox + Safari)       │   │
│  │                                                      │   │
│  │ • webRequest.onBeforeRequest → check blocked sites   │   │
│  │ • Redirect to block page with time bank info          │   │
│  │ • Catches HTTPS sites that /etc/hosts can't fully    │   │
│  │   block (some browsers bypass hosts file)             │   │
│  │ • Communicates with agent via native messaging        │   │
│  └────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────┘
```

### /etc/hosts Blocking

```
Daemon periodically (every 30s) syncs with server and writes:

# === DisciplineOS Managed Block — DO NOT EDIT ===
# Hash: sha256:abc123...  (daemon verifies integrity)
127.0.0.1  reddit.com
127.0.0.1  www.reddit.com
127.0.0.1  old.reddit.com
127.0.0.1  i.reddit.com
127.0.0.1  instagram.com
127.0.0.1  www.instagram.com
127.0.0.1  twitter.com
127.0.0.1  www.twitter.com
127.0.0.1  x.com
127.0.0.1  www.x.com
127.0.0.1  tiktok.com
127.0.0.1  www.tiktok.com
127.0.0.1  youtube.com
127.0.0.1  www.youtube.com
127.0.0.1  m.youtube.com
# === End DisciplineOS Block ===

After writing: sudo dscacheutil -flushcache && sudo killall -HUP mDNSResponder

Tamper detection:
  - FSEvents watcher on /etc/hosts
  - If hash doesn't match → immediately restore blocked entries
  - Log tamper attempt to server
```

### App Blocking (macOS)

```swift
// Agent monitors app launches
NSWorkspace.shared.notificationCenter.addObserver(
  forName: NSWorkspace.didLaunchApplicationNotification
) { notification in
  guard let app = notification.userInfo?[NSWorkspace.applicationUserInfoKey] 
    as? NSRunningApplication else { return }
  
  let bundleId = app.bundleIdentifier ?? ""
  
  if blockedApps.contains(bundleId) && !activeUnlocks.contains(bundleId) {
    // Option 1: Terminate gracefully
    app.terminate()
    
    // Option 2: Force terminate (if graceful fails after 2s)
    DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
      if app.isTerminated == false {
        app.forceTerminate()
      }
    }
    
    // Show notification
    showBlockNotification(appName: app.localizedName ?? bundleId)
  }
}
```

### macOS Lockdown Mode

```
When user enables lockdown:

1. Daemon generates random 64-char password
2. Daemon runs: dscl . -passwd /Users/<username> <old_password> <new_password>
3. New password hash stored ONLY on server (encrypted at rest)
4. User can no longer sudo → can't:
   - Edit /etc/hosts
   - Kill the daemon
   - Unload the LaunchDaemon
   - Install apps that bypass blocking

Emergency Unlock:
  1. User requests via menu bar agent or web dashboard
  2. Server receives request → starts 30-min countdown
     (gives time for impulse to pass)
  3. After 30 min: server pushes original password to daemon
  4. Daemon restores password via dscl
  5. User has 5 min window to do what they need
  6. After 5 min: password re-randomized
  7. Time bank charged: 5 min × 3 = 15 min deducted

Alternative: Accountability partner receives notification
  and must approve the unlock (social enforcement)

⚠️ SAFETY VALVE:
  - Boot into Recovery Mode (Cmd+R) → always resets password
  - This is intentional: true emergencies need a way out
  - Recovery mode access is logged (daemon detects unexpected reboot)
  - Takes 5+ minutes of deliberate action → stops impulse use
```

---

## 5. Reward System

### Earning Time

| Trigger | Condition | Reward | Cooldown |
|---------|-----------|--------|----------|
| Task Complete | Mark any task done | Per-task (default 15 min) | None |
| Gym Visit (short) | ≥ 30 min at gym geofence | 60 min | 1 per day |
| Gym Visit (long) | ≥ 60 min at gym geofence | 120 min | 1 per day |
| Going Outside | Leave home ≥ 15 min | 15 min | 1 per hour |
| Going Outside (long) | Leave home ≥ 60 min | 45 min | 1 per day |
| Walking | ≥ 5,000 steps | 30 min | 1 per day |
| Walking (bonus) | ≥ 10,000 steps | 45 min (total, not additional) | 1 per day |
| Streak Bonus | 7-day task streak | 2× rewards for 24 hours | Weekly |

### Spending Time

| Action | Cost | Mechanism |
|--------|------|-----------|
| Unlock app (normal) | 1:1 (15 min costs 15 min) | Select duration → deduct → unlock |
| Unlock site (normal) | 1:1 | Domain unblocked from hosts + VPN |
| Emergency unlock | 3:1 (5 min costs 15 min) | Instant, higher price |
| Unlock all (break mode) | 2:1 (30 min costs 60 min) | Everything unblocked for duration |

### Bank Rules

```
Maximum balance:     14,400 seconds (4 hours)
Daily decay:         25% at midnight (unused time decays)
                     e.g., 4h balance → 3h next morning
                     Encourages daily earning, prevents hoarding
Minimum balance:     0 (cannot go negative)
Emergency minimum:   Can always emergency unlock even at 0
                     → balance goes to -900 (15 min debt)
                     → must earn before normal unlocks resume
```

### Server-Side Reward Calculation

```typescript
// Gym reward calculation (on location event)
async function processGymVisit(userId: string, durationSeconds: number) {
  const rules = await db.query.rewardRules.findMany({
    where: and(
      eq(rewardRules.userId, userId),
      eq(rewardRules.triggerType, 'gym_visit'),
      eq(rewardRules.isActive, true)
    ),
    orderBy: desc(rewardRules.minDurationSeconds) // match highest tier first
  });
  
  // Check cooldown (only 1 gym reward per day)
  const lastGymReward = await db.query.transactions.findFirst({
    where: and(
      eq(transactions.userId, userId),
      eq(transactions.source, 'gym'),
      gte(transactions.createdAt, startOfDay(new Date()))
    )
  });
  if (lastGymReward) return; // already rewarded today
  
  // Find matching rule
  const rule = rules.find(r => durationSeconds >= r.minDurationSeconds);
  if (!rule) return;
  
  // Credit time bank
  await creditTimeBank(userId, rule.rewardSeconds, 'gym', 
    `Gym visit: ${Math.round(durationSeconds / 60)} min`);
}
```

---

## 6. Emergency Override System

### Flow Diagram

```
User opens blocked app
        │
        ▼
  ┌─────────────┐
  │ Block Screen │
  │              │
  │  [Normal]    │────→ Deduct 1:1 from bank → unlock for chosen duration
  │  [Emergency] │────→ Deduct 3:1 from bank → unlock for 5 min
  │  [Go Back]   │────→ Return to home screen
  └──────────────┘
        │
     Emergency
        │
        ▼
  ┌──────────────┐
  │ Bank ≥ 15min │──Yes──→ Deduct 15 min → Unlock 5 min → Timer starts
  │              │
  │     No       │
  │              │
  │ Bank ≥ 0     │──Yes──→ Deduct to -15 min (debt) → Unlock 5 min
  │              │          All normal unlocks disabled until debt repaid
  │              │
  │ Already in   │
  │ debt?        │──Yes──→ DENIED. Must earn time first.
  └──────────────┘          Show: "Complete a task to unlock"
```

### Key Properties:
1. **Always available** (unless in debt) — true emergencies work
2. **Expensive** — impulse use is discouraged by 3× cost
3. **Short** — only 5 min, forces you to be efficient
4. **Creates debt** — if bank is low, you go negative → no normal unlocks until repaid
5. **Logged** — visible in stats, useful for self-reflection

---

## 7. Cross-Device Sync

### WebSocket Protocol

```typescript
// Client → Server messages
type ClientMessage = 
  | { type: 'auth', token: string }
  | { type: 'heartbeat', deviceId: string }
  | { type: 'spend_request', seconds: number, identifier: string, isEmergency: boolean }
  | { type: 'location_event', locationId: string, eventType: string }
  | { type: 'bypass_attempt', attemptType: string, details: object }

// Server → Client messages  
type ServerMessage =
  | { type: 'balance_update', balance: number, maxBalance: number }
  | { type: 'unlock_granted', identifier: string, expiresAt: string }
  | { type: 'unlock_expired', identifier: string }
  | { type: 'blocked_list_update', apps: BlockedApp[], sites: BlockedSite[] }
  | { type: 'task_completed', taskId: string, earned: number }
  | { type: 'reward_earned', source: string, seconds: number, description: string }
  | { type: 'lockdown_event', event: string }
```

### Sync Flow

```
Device boots / app starts:
  1. REST: GET /api/bank → get current balance
  2. REST: GET /api/blocked/apps?platform=X → get blocked list
  3. REST: GET /api/blocked/sites → get blocked domains
  4. REST: GET /api/blocked/active-unlocks → get current unlocks
  5. WS: Connect to /api/sync → real-time updates
  6. Cache everything locally (Room DB on Android, CoreData on macOS)

During operation:
  - All state changes go through server
  - Server broadcasts to all connected devices
  - If offline: use cached state, queue actions, sync when back online
  - Unlock timers are SERVER-AUTHORITATIVE (prevents clock manipulation)
```

---

## 8. Security & Anti-Cheat

### Threat Model

| Bypass Attempt | Mitigation |
|---------------|------------|
| Uninstall Android app | Device Admin blocks uninstall |
| Force stop Android app | Always-on VPN → no network without app |
| Disable VPN | Network dies (lockdown mode) |
| Edit /etc/hosts (macOS) | Daemon detects tamper, restores instantly |
| Kill daemon (macOS) | Needs sudo → password randomized |
| Use different browser | /etc/hosts blocks ALL browsers; VPN blocks ALL apps |
| Change DNS settings | VPN overrides system DNS on Android |
| Change device clock | Server-authoritative timers |
| Use incognito mode | DNS/VPN blocking works regardless of browser mode |
| Use mobile data (bypass WiFi DNS) | VPN runs on all networks |
| Boot into safe mode (Android) | Device Admin persists; network still blocked |
| Recovery mode (macOS) | Available but logged; takes 5+ min deliberate action |
| Factory reset (Android) | Nuclear option that works; logged as bypass |

### Bypass Attempt Logging

Every detected bypass is:
1. Logged to server with timestamp and details
2. Visible in weekly stats report
3. Optionally sent as push notification to accountability partner
4. Counts toward "integrity score" visible in dashboard

---

## 9. Build Plan (Detailed)

### Phase 1: Server + Web Dashboard
```
server/
├── src/
│   ├── index.ts              ← Hono app entry
│   ├── db/
│   │   ├── schema.ts          ← Drizzle schema (all tables above)
│   │   └── migrate.ts
│   ├── routes/
│   │   ├── auth.ts
│   │   ├── bank.ts
│   │   ├── tasks.ts
│   │   ├── blocking.ts
│   │   ├── locations.ts
│   │   ├── devices.ts
│   │   ├── rules.ts
│   │   └── stats.ts
│   ├── services/
│   │   ├── timeBank.ts        ← Earn/spend/decay logic
│   │   ├── rewardEngine.ts    ← Location → reward calculation
│   │   └── sync.ts            ← WebSocket manager
│   └── middleware/
│       └── auth.ts            ← JWT verification
├── web/                       ← Simple web dashboard
│   ├── index.html
│   ├── dashboard.html
│   └── settings.html
├── drizzle.config.ts
├── package.json
└── Dockerfile
```

### Phase 2: Android App
```
android/
├── app/src/main/
│   ├── java/com/disciplineos/
│   │   ├── DisciplineApp.kt
│   │   ├── ui/
│   │   │   ├── MainActivity.kt
│   │   │   ├── screens/
│   │   │   │   ├── DashboardScreen.kt
│   │   │   │   ├── TasksScreen.kt
│   │   │   │   ├── SettingsScreen.kt
│   │   │   │   └── StatsScreen.kt
│   │   │   └── components/
│   │   │       └── BlockOverlay.kt
│   │   ├── service/
│   │   │   ├── AppMonitorService.kt       ← Foreground svc + usage monitor
│   │   │   ├── DnsVpnService.kt           ← Local VPN for DNS filtering
│   │   │   ├── GeofenceService.kt         ← Geofence registration
│   │   │   └── SyncService.kt             ← WebSocket + REST sync
│   │   ├── receiver/
│   │   │   ├── BootReceiver.kt
│   │   │   ├── DeviceAdminReceiver.kt
│   │   │   └── GeofenceBroadcastReceiver.kt
│   │   ├── data/
│   │   │   ├── local/
│   │   │   │   ├── AppDatabase.kt          ← Room DB
│   │   │   │   └── PreferencesManager.kt
│   │   │   ├── remote/
│   │   │   │   ├── ApiClient.kt            ← Retrofit
│   │   │   │   └── WebSocketClient.kt
│   │   │   └── repository/
│   │   │       ├── TimeBankRepository.kt
│   │   │       ├── TaskRepository.kt
│   │   │       └── BlockingRepository.kt
│   │   └── util/
│   │       ├── DnsPacketParser.kt
│   │       └── GeofenceHelper.kt
│   ├── res/
│   └── AndroidManifest.xml
├── build.gradle.kts
└── app/build.gradle.kts
```

### Phase 3: macOS Agent
```
macos/
├── DisciplineOSDaemon/           ← Root daemon (Swift)
│   ├── main.swift
│   ├── HostsFileManager.swift
│   ├── AppBlocker.swift
│   ├── LockdownManager.swift
│   ├── DaemonServer.swift        ← Unix socket for agent communication
│   └── com.disciplineos.daemon.plist
├── DisciplineOSAgent/            ← Menu bar app (SwiftUI)
│   ├── DisciplineOSApp.swift
│   ├── MenuBarView.swift
│   ├── DashboardView.swift
│   ├── ServerSync.swift
│   ├── DaemonClient.swift        ← Talks to daemon via Unix socket
│   └── Info.plist
├── BrowserExtension/             ← WebExtension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── block-page.html
│   └── native-messaging-host.json
└── Package.swift
```

### Phase 4: Polish
- Stats graphs (Chart.js on web, MPAndroidChart, Swift Charts)
- Android home screen widget (Glance API)
- Streak system with notifications
- Weekly email report
- Accountability partner invite system

---

## 10. Cost Estimate

| Resource | Cost | Notes |
|----------|------|-------|
| Fly.io (server) | $0-5/mo | Free tier: 3 shared VMs, 1GB storage |
| Neon PostgreSQL | $0/mo | Free tier: 512MB storage, plenty |
| FCM (push notifications) | $0/mo | Free for reasonable volume |
| Domain (optional) | $10/yr | disciplineos.yourdomain.com |
| Apple Developer (if needed) | $99/yr | Only for Safari extension + notarization |
| **Total** | **$0-15/mo** | |

---

## 11. Risks & Mitigations

| Risk | Impact | Mitigation |
|------|--------|------------|
| macOS password lock-out | Can't use computer | Recovery Mode always works; document it |
| Android lockdown kills needed app | Can't access banking etc. | Whitelist essential apps during setup |
| VPN blocks legitimate traffic | Apps break | DNS-only filtering; only block listed domains |
| Geofence inaccuracy | False gym rewards | Require minimum dwell time (30 min) |
| Server goes down | No sync, stale state | Local cache works offline; queue sync |
| Battery drain (Android) | Phone dies | DNS VPN is lightweight; geofencing is system-managed |
| Forgetting emergency unlock exists | Panic | Onboarding flow teaches emergency unlock |

---

## 12. Research-Derived Enhancements (from landscape analysis)

Based on analysis of 30+ existing products across 5 categories, these features should be added to the base architecture:

### 12.1 Configuration Delay System (from Pluckeye)

**The single most important anti-bypass enhancement.**

When you want to remove an app/site from the blocked list, the change doesn't take effect immediately. Instead:

```
User requests: "Remove Instagram from blocked list"
  → Server stores pending change with delay
  → Default delay: 24 hours (configurable: 1h to 72h)
  → User receives notification when change takes effect
  → During delay: change can be cancelled (re-blocking is instant)
  → After delay: change applies automatically
```

**Why this is better than a password:** You can't impulsively unblock anything. Even if you know the password, even if you're the admin, the system enforces a waiting period. By the time the delay expires, the impulse has passed. Pluckeye has proven this over 10+ years — it's the most psychologically effective anti-bypass mechanism ever designed.

Database addition:
```sql
CREATE TABLE pending_changes (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID REFERENCES users(id) NOT NULL,
  change_type  TEXT NOT NULL,       -- 'unblock_app', 'unblock_site', 'disable_lockdown', 'change_rule'
  payload      JSONB NOT NULL,      -- details of the change
  requested_at TIMESTAMPTZ DEFAULT now(),
  effective_at TIMESTAMPTZ NOT NULL, -- requested_at + delay
  cancelled_at TIMESTAMPTZ,
  applied_at   TIMESTAMPTZ
);
```

### 12.2 Google Fit / Health Connect Integration (from Habit Doom)

Belt-and-suspenders exercise verification:
- **Primary:** Geofencing confirms you're AT the gym
- **Secondary:** Health Connect API confirms you actually EXERCISED (heart rate elevated, calories burned, workout recorded)
- Both must agree for full reward; geofence-only gives 50% reward

This prevents gaming the system by sitting in the gym parking lot.

```kotlin
// Android: Health Connect API check
val exerciseRecords = healthConnectClient.readRecords(
    ReadRecordsRequest(ExerciseSessionRecord::class, timeRange)
)
val totalActiveMinutes = exerciseRecords.sumOf { it.activeDuration.toMinutes() }
val avgHeartRate = heartRateRecords.averageOf { it.beatsPerMinute }

// Reward calculation:
// geofence + exercise data → 100% reward
// geofence only → 50% reward  
// exercise data only (different gym?) → 75% reward
```

### 12.3 Photo Verification for Tasks (from Locky)

Optional per-task setting: require a photo as proof of completion.

```
Task: "Clean your room"
  → User marks complete
  → App requires photo
  → Photo is stored with task completion record
  → No AI verification (that's overkill) — just the act of taking
    a photo adds friction against lying, and creates a record
```

Database addition:
```sql
ALTER TABLE tasks ADD COLUMN requires_photo BOOLEAN DEFAULT false;
ALTER TABLE tasks ADD COLUMN completion_photo_url TEXT;
```

### 12.4 Financial Consequences (from Digital Detox Android)

Optional "nuclear accountability" mode:

```
Emergency unlock → $5 donated to a charity you dislike
  (or a charity you like — positive framing works too)

Implementation: Stripe payment link pre-authorized during setup
  Emergency unlock triggers charge → receipt emailed
  Monthly report shows total "penalty donations"
```

This is opt-in and powerful. Research shows financial consequences are 3-5× more effective than digital penalties.

### 12.5 URL Path Blocking (from Curbox)

Don't just block entire domains — block specific paths:

```
Block: youtube.com/shorts     (Shorts are addictive)
Allow: youtube.com/watch      (Long-form is fine)
Allow: youtube.com/@channel   (Subscribed channels)

Block: reddit.com/r/all       (Infinite scroll)
Allow: reddit.com/r/programming (Productive subreddit)

Block: twitter.com/home       (Timeline/feed)
Allow: twitter.com/search     (Specific searches)
```

This requires the browser extension for enforcement (DNS can't see URL paths). On Android, the VPN would need to do HTTP header inspection for the Host + path (only for HTTP; HTTPS requires SNI inspection which only gives domain).

### 12.6 Smart Home Integration (from Axorith)

Optional Home Assistant / HomeKit integration:

```
Focus Mode Activated:
  → Smart lights change to cool white (focus color)
  → Gaming monitor turns off (smart plug)
  → Focus playlist starts (Spotify API)

Distraction Mode (time bank used):
  → Lights change to warm amber (relax)
  → Timer visible on smart display

Lockdown Violation:
  → Lights flash red briefly (shame signal)
```

### 12.7 Visible Loss Mechanic (from Forest)

The time bank should have a visual representation that makes loss feel real:

```
Time Bank Visualization:
  - Full bank (4 hours): Lush green garden / full energy bar
  - Depleting: Garden withers / bar drains (animated in real-time)
  - Empty: Barren desert / red empty state
  - In debt (emergency): Cracked, dead landscape
  - Recovering: Seeds sprouting

Widget (Android home screen):
  Shows garden state at a glance
  Tapping opens app

Menu bar (macOS):
  Icon changes based on bank state:
  ⏱ 4h (green) → ⏱ 2h (yellow) → ⏱ 30m (orange) → ⏱ 0m (red)
```

### 12.8 Streak System with Real Consequences

```
Daily streak: Complete at least 1 task per day
  7-day streak  → 2× rewards for 24 hours
  30-day streak → Choose: unlock a "free hour" or permanent new reward rule
  
Breaking streak:
  → Streak counter resets to 0
  → Time bank maximum reduced by 25% for 3 days (punishment)
  → Visual: streak flame extinguishes (loss aversion trigger)
```

---

## 13. Revised Architecture Summary (Post-Research)

The research validates the core architecture and adds these layers:

```
┌──────────────────────────────────────────────────────────┐
│                    DisciplineOS v2                        │
│                                                          │
│  ENFORCEMENT         REWARD              PSYCHOLOGY      │
│  ───────────         ──────              ──────────      │
│  • App blocking      • Time bank         • Config delay  │
│  • DNS VPN           • Task rewards      • Loss aversion │
│  • /etc/hosts        • Gym rewards       • Streak system │
│  • Device Admin      • Outdoor rewards   • Visible decay │
│  • Lockdown mode     • Step rewards      • Photo proof   │
│  • Always-on VPN     • Streak bonuses    • Financial $   │
│  • Process kill      • Health Connect    • NFC friction  │
│  • Browser ext       • URL path rules    • Social acct.  │
│  • Config delay      • Smart home        • Delay gates   │
│                                                          │
│  UNIQUE COMBINATION: No existing product has all three   │
└──────────────────────────────────────────────────────────┘
```

### What to build vs. what to skip

**Must have (Phase 1-3):**
- Core time bank + task system + cross-device sync
- App blocking (Android) + website blocking (all platforms)
- Geofencing for gym/outdoor rewards
- Configuration delay system (24h delay for unblocking)
- Lockdown mode (Device Admin + always-on VPN + password randomization)
- Emergency unlock with 3× penalty

**Should have (Phase 4):**
- Health Connect exercise verification
- Streak system with consequences
- Browser extension with URL path blocking
- Visible time bank widget/menu bar
- Photo verification for tasks
- Daily decay + bank cap

**Nice to have (Phase 5+):**
- Smart Home integration
- Financial consequences (Stripe)
- NFC physical interaction
- Social accountability / leaderboard
- Self-hosted MDM enrollment
