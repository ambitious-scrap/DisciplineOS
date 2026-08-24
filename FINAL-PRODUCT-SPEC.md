# DisciplineOS — Final Product Specification

**Status:** Approved product direction for V1 implementation  
**Date:** 2026-08-25  
**Owner:** Personal-use system  
**Related build plan:** [`BUILD-PLAN.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/BUILD-PLAN.md)  
**Related architecture:** [`ARCHITECTURE.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/ARCHITECTURE.md)  
**Related engineering guidelines:** [`AGENTS.md`](file:///Users/dinesh/Documents/Projects/DiscplineOS/AGENTS.md)

## 1. Product definition

DisciplineOS is a personal, cross-device discipline system that keeps distracting apps and websites blocked by default, verifies productive or physically healthy behavior, and converts verified behavior into a customizable allowance for distraction time.

The system is designed for one person using:

- Android phone
- Android tablet
- MacBook Air

The server owns the reward ledger, policies, device reservations, and active unlock sessions. Native device agents enforce the policy locally.

## 2. Product principles

1. **Earned access:** distracting access is earned through completed tasks, focus sessions, or verified movement.
2. **One source of truth:** all online balance changes are committed to an immutable server ledger.
3. **Strong but recoverable:** normal use should resist impulsive bypass while preserving a deliberate recovery path.
4. **Privacy by minimisation:** store reward-relevant summaries, not continuous location trails or unnecessary personal content.
5. **Customisable rules:** reward values, costs, caps, decay, reserve sizes, cooldowns, and emergency penalties are user-configurable.
6. **Native enforcement:** Android and macOS agents use operating-system capabilities; the web app is a control surface, not the blocker.
7. **Offline continuity:** cached restrictions remain active offline, while offline spending uses a server-issued device reserve.

## 3. V1 scope

### Included

- Account and device pairing for one personal user
- Android phone and tablet agents in normal mode
- Shared blocked-app and blocked-domain policy
- Focus sessions spanning all connected devices
- Task creation, recurrence, completion, and configurable rewards
- Time-bank earning and spending
- Gym and home geofences
- Gym presence plus movement verification
- Outside-home presence plus movement verification
- Optional live photo proof for selected tasks
- Device-specific offline reward reserves
- Global single-active-distraction-session rule
- Emergency unlock with configurable penalty
- Local cached policy and server reconciliation
- Web dashboard for configuration, history, and status
- Strong-but-recoverable macOS agent in a later V1 phase

### Deferred

- Android Device Owner / hard lockdown mode
- Health Connect exercise-session verification
- AI photo verification
- Continuous GPS tracking or route history
- Social accountability and leaderboards
- Smart-home control
- Financial penalties or charity donations
- URL-path filtering on Android
- Public multi-user accounts

## 4. Core concepts

### 4.1 Reward balance

The user has one global balance of integer reward points. The UI displays points primarily as minutes, but the underlying unit is points so that different distractions can have different prices.

Example configurable pricing:

| Distraction | Default price concept |
|---|---:|
| Low-risk entertainment | 1 point per minute |
| Social media | 2 points per minute |
| Short-form feeds | 3 points per minute |
| Games | 1.5 points per minute |

The exact defaults are configuration, not product invariants.

### 4.2 Earn rules

An earn rule defines a trigger, evidence requirement, reward, cooldown, cap, and optional schedule.

Supported V1 triggers:

- Manual task completion
- Focus session completion
- Gym presence plus movement
- Outside-home presence plus movement
- Optional photo-supported task completion

Every reward creates an immutable ledger entry. Reversals create compensating entries rather than editing history.

### 4.3 Spend rules

Normal spending is 1:1 by default: one minute of access consumes the configured number of points for that item.

Supported unlock types:

- One app for a selected duration
- One domain or blocked-site group for a selected duration
- A configurable break mode for multiple items

Only one active distraction session may run globally in V1. If the MacBook is consuming an unlock, the Android devices cannot start a second distraction session.

### 4.4 Emergency unlock

Emergency unlock is a deliberate recovery path, not a normal feature.

Default concept:

- Short duration
- Configurable cost multiplier, initially 3x
- Logged in the ledger and visible in reports
- Optional debt when the balance is insufficient
- Debt disables normal spending until repaid, if enabled

The user can configure the multiplier, duration, debt behavior, and whether emergency access is always available.

## 5. User journeys

### 5.1 Start focus

1. User selects a focus duration and optional focus profile.
2. Server creates a signed active focus session.
3. All devices receive the policy update.
4. Selected distractions become blocked everywhere.
5. The session ends only at its expiry or through the configured recovery path.
6. Completing the session credits the configured reward.

### 5.2 Open a blocked app

1. Device agent detects a blocked app or site.
2. It presents the block screen with the reason, current balance, and available actions.
3. User selects a duration.
4. Server atomically checks balance and the global-session lock.
5. If approved, the server deducts points and issues a signed unlock lease.
6. Every connected device receives the new active-session state.
7. The local timer enforces the server expiry and reports spend telemetry.

### 5.3 Complete a task

1. User opens a task and starts or completes it according to the task type.
2. Manual tasks may require only a confirmation.
3. Focus tasks require an uninterrupted timer and policy compliance.
4. Photo-required tasks open a live camera capture flow; gallery selection is not accepted by default.
5. The device submits evidence metadata and the task completion event.
6. The server applies the configured reward once, using an idempotency key.

V1 photo proof is a friction and record mechanism, not an AI judgement system.

### 5.4 Verify a gym visit

1. User configures a gym geofence and reward rule.
2. Android registers the geofence with the operating system.
3. Enter and exit events are recorded locally and synchronised.
4. The system measures dwell time and movement/activity evidence during the visit.
5. A reward is eligible only when the configured minimum dwell and movement thresholds are met.
6. Cooldown and daily caps prevent repeated rewards from one visit or repeated entry cycles.

V1 accepts presence plus movement as sufficient. Health Connect is a future stronger verification layer.

### 5.5 Verify going outside

1. User configures a home geofence and an outside reward rule.
2. The device detects exit from home.
3. The user must remain outside for the configured duration and show movement.
4. The system credits the reward after the exit session is closed and validated.
5. Returning home before the threshold cancels or reduces the reward according to configuration.

### 5.6 Spend points while offline

1. While online, the server allocates a device-specific reserve.
2. The reserve is carved out of the global balance and cannot be spent on another device.
3. The Android agent can issue local unlocks from that reserve while offline.
4. Each local spend is written to an append-only outbox with a unique event ID.
5. When connectivity returns, the server reconciles the outbox exactly once.
6. Unused reserve points return to the global balance when the reservation expires or is released.

The device reserve is a controlled allowance, not permission to mint new points offline.

## 6. Functional requirements

### FR-1: Identity and pairing

- The system supports one personal account in V1.
- A new device is paired through a short-lived code or authenticated link.
- Device names, platform, software version, last-seen time, and enforcement status are visible.
- Public self-registration and multi-user roles are out of scope.

### FR-2: Policy management

- Blocked apps are identified by platform-specific package or bundle identifiers.
- Blocked websites are represented as domains or domain groups.
- Policies may differ by device, platform, time, profile, and location.
- Re-enabling a previously blocked item is immediate only when the user has configured that behavior; a configurable change delay is supported for stronger self-control.
- Re-blocking is always immediate.

### FR-3: Android app enforcement

Normal mode uses:

- UsageStatsManager for foreground-app detection
- Accessibility service as a secondary enforcement mechanism
- Full-screen block activity/overlay
- Foreground service for reliable operation
- Boot receiver to restore policy after reboot
- Local cache to continue enforcement offline

Normal mode must clearly show permission state and provide a recovery path if a permission is revoked. It is not presented as impossible to bypass.

### FR-4: Android website enforcement

- A local VpnService provides domain/DNS filtering across Wi-Fi and mobile data.
- Blocked-domain policy is cached locally.
- VPN interruption is recorded as a protection event.
- The agent must avoid blocking essential connectivity and must show the user when protection is degraded.
- URL-path filtering is deferred because DNS filtering cannot reliably distinguish HTTPS paths.

### FR-5: Task management

- Tasks have title, description, schedule, reward, evidence type, cooldown, and active state.
- Recurring tasks create a new completion opportunity rather than mutating historical records.
- A task cannot credit more than once for the same occurrence.
- Tasks may optionally require a live photo.
- The user can edit reward rules subject to any configured change delay.

### FR-6: Location and movement

- Android uses OS geofencing rather than continuous tracking.
- Location events are stored as enter, exit, dwell, movement-summary, and validation-result records.
- Raw location trails are not stored by default.
- Gym rewards require configured dwell time plus movement evidence.
- Outside rewards require home exit, outside dwell, and movement evidence.
- Every rule supports a daily cap and cooldown.

### FR-7: Reward ledger

- All server-side earn and spend operations are atomic.
- Ledger entries are immutable.
- Every operation has an idempotency key.
- The balance is derived from the ledger or maintained transactionally with verifiable reconciliation.
- The user can inspect the source, description, device, time, and amount for every entry.

### FR-8: Cross-device state

- The server distributes policy, balance, active sessions, device reservations, and emergency state.
- The global active-session lock prevents double-spending in V1.
- Devices show last synchronisation time and policy version.
- Server-issued unlock leases include expiry and a device binding.

### FR-9: Offline operation

- Cached blocks remain active without internet access.
- A device may spend only from its current reserve.
- New offline earns are marked pending until validated online, unless the rule is explicitly configured as locally verifiable.
- Reconciliation is idempotent and conflict-safe.
- Clock rollback or suspicious time changes freeze offline spending until reconnected.

### FR-10: macOS strong-but-recoverable enforcement

The Mac agent is a later V1 phase. It should combine:

- Menu-bar control surface
- Browser extension for precise website control
- Native app/process enforcement
- Network filtering where supported
- Local cached policy
- Clear recovery and diagnostic tools

The implementation must not depend on an unrecoverable hidden administrator password. Recovery mode, documented manual removal, and a deliberate bypass log are required.

### FR-11: Dashboard

The web dashboard provides:

- Current balance and reserved points
- Active sessions
- Tasks and task history
- Blocked apps and domains
- Reward rules
- Geofences
- Device status
- Offline reserve status
- Bypass/protection events
- Daily and weekly earn/spend summaries

## 7. Non-functional requirements

### Privacy

- No continuous GPS tracking by default.
- Location summaries are encrypted in transit and at rest.
- Photo evidence is private and user-deletable.
- The server stores no browsing history beyond the minimum events needed for balance and enforcement.
- Logs avoid URLs containing query parameters where possible.

### Reliability

- Android blocking continues through ordinary network outages.
- Policy updates are versioned and can be rolled back.
- Server operations are idempotent.
- Device health and permission degradation are visible.

### Security

- Access tokens are short-lived and refresh tokens are revocable.
- Device credentials are scoped to one device.
- Unlock leases are signed or otherwise integrity-protected.
- Server-side balance changes require authenticated device or dashboard calls.
- Photos and evidence use private storage with expiring access URLs.

### Recoverability

- Normal Android mode can be disabled deliberately by the user.
- macOS provides documented recovery steps.
- Every hardening step is introduced only after the corresponding recovery procedure is tested.
- Android Device Owner mode is a future opt-in and must warn about reset requirements beforehand.

## 8. Initial configurable defaults

These are starting values, not fixed product rules:

| Setting | Starting value |
|---|---:|
| Maximum balance | 4 hours of displayed access |
| Normal unlock pricing | 1:1 |
| Emergency unlock | 5 minutes for 15 minutes of points |
| Gym minimum dwell | 30 minutes |
| Gym movement requirement | Configurable movement threshold |
| Outside minimum duration | 60 minutes |
| Gym reward cooldown | Once per day |
| Outside reward cooldown | Once per day |
| Offline device reserve | Configurable per device |
| Balance decay | Disabled initially; configurable later |
| Negative debt | Disabled initially; configurable later |
| Configuration-change delay | Disabled initially; configurable later |

## 9. Data model overview

Core entities:

- User
- Device
- Policy profile
- Blocked app
- Blocked domain
- Task
- Task occurrence
- Evidence record
- Location
- Location event
- Reward rule
- Ledger entry
- Active session
- Device reserve
- Offline spend event
- Protection/bypass event
- Configuration change request

Important invariants:

1. Ledger entries are never updated or deleted.
2. Each task occurrence can generate at most one reward.
3. Each offline event can be reconciled at most once.
4. Reserved points cannot be spent twice.
5. An active session has one owner device in V1.
6. An expired lease cannot be renewed by the device without server approval.

## 10. Acceptance criteria for V1

V1 is acceptable when:

- A blocked Android app is intercepted and the user sees a useful block screen.
- A blocked website is denied through the local VPN on Wi-Fi and mobile data.
- A focus session blocks the selected items on phone and tablet.
- A completed task credits the ledger exactly once.
- A gym visit credits only after dwell and movement thresholds are met.
- A photo-required task cannot be completed without a live capture.
- Offline spending works only within a previously issued device reserve.
- Reconnection reconciles offline events without double-credit or double-spend.
- The dashboard shows an explainable balance and history.
- Revoked permissions and server outages are visible rather than silently failing.
- The user can recover normal mode without factory-resetting a device.

## 11. Research basis and boundaries

The product direction consolidates the supplied research and the earlier landscape review. Useful patterns were drawn from [Freedom](https://freedom.to/), [Cold Turkey](https://getcoldturkey.com/support/user-guide/), [SelfControl](https://github.com/SelfControlApp/selfcontrol), [Forfeit](https://www.forfeit.app/), [Beeminder](https://www.beeminder.com/overview), [Habitica](https://play.google.com/store/apps/details?id=com.habitrpg.android.habitica), [WeWard Walking Mode](https://www.wewardapp.com/blog/walking-mode), and Android's [DevicePolicyManager](https://developer.android.com/reference/android/app/admin/DevicePolicyManager).

Market prices, user counts, enforcement claims, and academic effect-size claims in the research notes are treated as directional context, not as product requirements. Platform behavior will be validated on the actual Android and macOS versions before hardening decisions are made.
