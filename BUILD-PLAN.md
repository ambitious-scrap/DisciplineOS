# DisciplineOS — Build Plan

**Status:** Approved implementation plan for V1  
**Date:** 2026-08-25  
**Primary implementation decision:** Native Kotlin Android agent  
**Related specification:** [`FINAL-PRODUCT-SPEC.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/FINAL-PRODUCT-SPEC.md)  
**Related architecture:** [`ARCHITECTURE.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/ARCHITECTURE.md)  
**Related engineering guidelines:** [`AGENTS.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/AGENTS.md)

## 1. Build strategy

Build the system in the order that reduces uncertainty:

1. Prove the reward ledger and policy model.
2. Build a useful Android normal-mode enforcer.
3. Validate tasks, focus sessions, movement rewards, and offline reserves on real devices.
4. Add the macOS strong-but-recoverable agent.
5. Add Android hard mode only after recovery behavior is proven.

Do not start with root-level macOS controls, Device Owner provisioning, or financial penalties. They increase recovery risk before the behavioral model has been validated.

## 2. Technology choices

### Android

- Kotlin
- Jetpack Compose
- Room
- Coroutines and Flow
- WorkManager
- UsageStatsManager
- AccessibilityService
- VpnService
- Geofencing API
- Activity Recognition API
- CameraX or system camera capture
- Retrofit or Ktor client
- Firebase Cloud Messaging

The Android app is native because enforcement depends on OS services, permission flows, background execution, VPN behavior, and future Device Owner APIs. Flutter is not selected for the enforcement agent; it would still require a large native Kotlin subsystem. A web app cannot enforce app or network restrictions.

### Backend

- TypeScript
- Hono or an equivalent small HTTP framework
- PostgreSQL
- Drizzle or equivalent typed database layer
- REST API first
- FCM for Android notifications and wake-up hints
- Managed PostgreSQL deployment for initial simplicity, with no raw location trails

WebSockets are deferred until REST plus push notifications prove insufficient. The server remains authoritative regardless of transport.

### Dashboard

- Small web application
- Responsive layout for phone and desktop
- Dashboard is for setup, rules, tasks, reports, and recovery—not enforcement

### macOS later

- Swift and SwiftUI
- Menu-bar agent
- Browser extension
- Native helper/enforcement component
- Network filtering and Apple APIs evaluated in a short technical spike before implementation

## 3. Proposed repository layout

```text
disciplineos/
  server/
    src/
      auth/
      devices/
      ledger/
      policies/
      tasks/
      rewards/
      locations/
      sessions/
      reserves/
      sync/
    db/
    migrations/
    tests/
  android/
    app/src/main/java/com/disciplineos/
      ui/
      domain/
      data/
      enforcement/
      vpn/
      location/
      evidence/
      sync/
      permissions/
  macos/
    Agent/
    Helper/
    BrowserExtension/
  dashboard/
  docs/
```

## 4. Phase plan

### Phase 0 — Project foundation

**Goal:** make the project buildable and testable.

Tasks:

- Create the repository structure.
- Set up Kotlin Android project and Compose shell.
- Set up TypeScript API and database migrations.
- Define shared API types and identifiers.
- Create local development configuration.
- Establish structured logging and privacy-safe defaults.
- Add basic CI for server, Android, and dashboard builds.

Exit criteria:

- Android debug APK builds and installs.
- API starts locally and can run migrations.
- A test database can be created and destroyed safely.
- No secrets are committed.

### Phase 1 — Server ledger and policy core

**Goal:** implement the authoritative state before building complex enforcement.

Tasks:

- Implement user/device pairing.
- Implement blocked-app and blocked-domain policy.
- Implement tasks and task occurrences.
- Implement reward rules.
- Implement immutable ledger entries.
- Implement atomic earn and spend transactions.
- Implement active global session lock.
- Implement device-specific reserve allocation.
- Implement idempotency keys.
- Implement audit/protection events.
- Add API contract tests.

Initial API areas:

```text
POST   /auth/pair
GET    /devices
POST   /devices
GET    /policy
PUT    /policy
GET    /tasks
POST   /tasks
POST   /task-occurrences/:id/complete
GET    /ledger
GET    /balance
POST   /sessions/start
POST   /sessions/spend
POST   /sessions/release
GET    /reserves
POST   /reserves/reconcile
POST   /events/protection
```

Exit criteria:

- Concurrent spend tests never overdraw the balance.
- Duplicate completion and spend requests are harmless.
- One active global distraction session is enforced.
- Device reservations reduce spendable global balance correctly.
- Ledger history explains every balance change.

### Phase 2 — Android normal-mode foundation

**Goal:** enforce apps and websites on the phone without requiring a reset.

Tasks:

- Build permission onboarding.
- Register device and sync policy.
- Cache policy and sessions in Room.
- Implement foreground-app detection with UsageStatsManager.
- Implement block screen and return-home behavior.
- Add AccessibilityService as backup detection/enforcement.
- Implement foreground service and boot restoration.
- Implement local VpnService DNS filtering.
- Add protection-degraded events when required services stop.
- Add basic FCM policy wake-up.

Normal-mode limitation to document clearly:

- The user can eventually revoke permissions, stop services, uninstall the app, or factory-reset the device.
- The system logs degraded protection; it does not pretend this mode is unbypassable.

Exit criteria:

- A selected app is blocked after reboot.
- A selected domain is blocked on Wi-Fi and mobile data.
- The user can spend points to obtain a time-limited unlock.
- Unlock expiry is enforced locally and reflected on the server.
- Removing/revoking permissions produces a visible warning.

### Phase 3 — Tasks, evidence, and rewards

**Goal:** make the earned-access loop useful.

Tasks:

- Add task list and recurrence UI.
- Add focus-session timer.
- Credit focus rewards only after policy-compliant completion.
- Add manual completion with configurable reward.
- Add live photo evidence for selected tasks.
- Store private evidence metadata and secure photo objects.
- Prevent duplicate completion through task-occurrence IDs.
- Add daily and weekly history.

Photo implementation rules:

- Capture from the camera flow by default.
- Do not run AI verification in V1.
- Make photo requirement explicit before task start.
- Allow user deletion of evidence.

Exit criteria:

- A focus session earns once and only once.
- A photo-required task cannot be completed without an accepted capture.
- The dashboard shows evidence status and reward source.

### Phase 4 — Geofencing, movement, and offline reserves

**Goal:** connect physical behavior to rewards without continuous tracking.

Tasks:

- Add home and gym geofence setup.
- Register system geofences on Android.
- Record enter/exit events locally.
- Measure dwell duration.
- Add Activity Recognition movement evidence.
- Implement gym reward rule with cooldown and daily cap.
- Implement outside-home reward rule.
- Add local event validation and pending states.
- Implement device-specific offline reserve allocation.
- Implement append-only offline spend outbox.
- Reconcile events with idempotent server endpoints.
- Detect clock rollback and freeze offline spending when suspicious.

Offline reserve protocol:

```text
Online:
  server allocates reserve to device
  global available balance decreases

Offline:
  device spends only from local reserve
  local monotonic timer controls lease duration
  every spend receives a unique event ID

Reconnect:
  device uploads outbox
  server accepts each event once
  unused reserve is returned or renewed
  policy and balance are refreshed
```

Exit criteria:

- A gym visit requires both dwell and movement.
- A home exit can earn only after the configured outside duration.
- Repeated geofence events cannot repeatedly award the same visit.
- Offline spend cannot exceed the device reserve.
- Reconnection produces no duplicate spend or reward.

### Phase 5 — Android hard mode spike

**Goal:** evaluate stronger enforcement without silently changing the user’s device state.

This phase is opt-in and must warn before any reset or provisioning step.

Tasks:

- Test Android Device Owner provisioning on a spare or explicitly approved device.
- Document exactly what is reset and what is protected.
- Test app suspension, uninstall restrictions, safe-mode behavior, recovery, and factory reset.
- Compare Device Owner enforcement against the normal-mode agent.
- Add an explicit hard-mode enablement flow only after recovery is validated.

Important user-facing requirement:

> DisciplineOS must tell the user beforehand if enabling hard mode requires resetting a mobile device.

Exit criteria:

- Provisioning steps are repeatable.
- Recovery and deprovisioning steps are documented and tested.
- The user explicitly confirms the reset before it begins.

### Phase 6 — macOS strong-but-recoverable agent

**Goal:** enforce the same policy on the Mac without creating an unrecoverable system.

Tasks:

- Build SwiftUI menu-bar agent.
- Pair Mac with the server.
- Cache policy and active leases locally.
- Add browser extension for site and path-level blocking.
- Add native app/process enforcement.
- Test Apple Managed Settings/Screen Time capabilities for the target macOS version.
- Evaluate network filtering as a fallback or stronger layer.
- Add diagnostics and clear recovery instructions.
- Log service failures and policy drift.

The implementation spike must answer before hardening:

- Which controls survive logout and reboot?
- Which controls require user authorization or entitlement?
- Can the browser extension and native agent agree on policy state?
- What is the cleanest recovery path?

Exit criteria:

- Selected Mac apps and sites are blocked under the active policy.
- Blocking resumes after reboot.
- Recovery is deliberate but documented.
- The user is never dependent on an unknown randomized administrator password.

### Phase 7 — Polish and optional enhancements

Potential additions:

- Health Connect exercise verification
- Configurable delayed policy changes
- URL-path rules on desktop
- Android home-screen widget
- Mac menu-bar balance indicator
- Balance visualization
- Optional streaks
- Optional NFC friction
- Smart-home integration
- Optional external accountability

These are not prerequisites for the core system.

## 5. Testing plan

### Server tests

- Ledger atomicity
- Concurrent spending
- Idempotency
- Session ownership
- Reserve allocation and release
- Offline reconciliation
- Cooldowns and daily caps
- Time-zone boundaries
- Clock anomaly handling

### Android tests

- Permission onboarding
- App detection after cold start and reboot
- Overlay behavior
- Accessibility fallback
- VPN start/stop and DNS failure behavior
- Wi-Fi/mobile-data transitions
- Geofence enter/exit/dwell
- Activity Recognition evidence
- Camera evidence capture
- Offline outbox and reconnect
- Battery and foreground-service behavior

### Mac tests

- App/site blocking
- Browser extension/native-agent agreement
- Logout and reboot persistence
- Network changes
- Policy refresh
- Recovery procedure

### Behavioral acceptance tests

- User can understand why an item is blocked.
- User can see exactly what action earns access.
- User can recover from a legitimate emergency.
- Rewards feel predictable and explainable.
- Offline behavior does not surprise the user.
- A server outage does not silently remove protection.

## 6. Security and recovery checklist

- Never store raw passwords or administrator credentials in the app.
- Never make hard mode the default.
- Never enable Device Owner without an explicit reset warning.
- Keep an offline recovery guide outside the blocked devices.
- Test recovery before increasing enforcement strength.
- Use private, expiring URLs for photo evidence.
- Avoid storing raw location trails.
- Treat Accessibility and VPN permissions as sensitive capabilities.
- Log protection degradation without collecting unnecessary usage content.

## 7. Delivery milestones

### Milestone A — Ledger demo

Server, dashboard shell, tasks, balance, ledger, and simulated spend.

### Milestone B — Android blocking demo

Phone app, app blocking, website filtering, policy sync, and unlock leases.

### Milestone C — Reward loop demo

Focus tasks, manual tasks, photo proof, and reward history.

### Milestone D — Physical verification demo

Gym/home geofences, movement evidence, cooldowns, and rewards.

### Milestone E — Offline and tablet demo

Device reserves, offline spending, reconciliation, and second-device sync.

### Milestone F — Mac demo

Strong-but-recoverable Mac enforcement and recovery workflow.

### Milestone G — Optional hard mode

Device Owner evaluation and explicit provisioning flow.

## 8. Definition of Done for the first usable release

The first usable release is complete when the user can:

1. Pair phone and tablet.
2. Select apps and domains to block.
3. Complete a focus session or task.
4. Earn points exactly once.
5. Spend points on one device without creating a second global session.
6. Continue using a device reserve during a network outage.
7. Reconnect without balance corruption.
8. Earn from a verified gym or outside visit.
9. Submit optional photo evidence.
10. View every important event in the dashboard.
11. Recover normal mode without resetting a device.

## 9. Risks and mitigations

| Risk | Mitigation |
|---|---|
| Android permissions are revoked | Visible health status, protection events, re-onboarding |
| VPN conflicts with another VPN | Detect and explain conflict; support safe disable/retry |
| False gym reward | Require dwell plus movement, cooldowns, and caps |
| Location battery drain | OS geofencing, not continuous tracking |
| Offline clock manipulation | Monotonic timing, rollback detection, reconnect requirement |
| Server outage | Cached policy, bounded device reserves, clear status |
| Mac implementation is brittle | Technical spike before locking the enforcement method |
| User locks themselves out | Recovery path tested before stronger enforcement |
| Reward economy is too punitive | Configurable defaults, start without decay/debt, review usage data |

## 10. First implementation sequence

The first coding pass should be:

1. Create the monorepo and local development environment.
2. Implement PostgreSQL schema and immutable ledger.
3. Implement device pairing and policy retrieval.
4. Build the Kotlin app shell and permission onboarding.
5. Implement Android app detection and block screen.
6. Implement one blocked domain through VpnService.
7. Implement normal unlock spending and expiry.
8. Add focus sessions and task rewards.
9. Add photo evidence.
10. Add geofences and movement rewards.
11. Add offline device reserves.
12. Test on the actual phone and tablet before beginning macOS work.
