# DisciplineOS

**DisciplineOS** is a personal, cross-device discipline system that keeps distracting apps and websites blocked by default, verifies productive or physically healthy behavior, and converts verified behavior into a customizable allowance for distraction time.

---

## 📱 Supported Platforms

- **Android Phone & Tablet:** Native Kotlin enforcer (`UsageStatsManager`, `AccessibilityService`, `VpnService`, `Geofencing`, and `ActivityRecognition`).
- **MacBook Air:** Native macOS Swift helper & menu-bar agent (`LaunchDaemon`, Network Extension/filter, Browser extension).
- **Central Server:** TypeScript / Hono + PostgreSQL ledger & session orchestrator.
- **Web Dashboard:** Responsive control surface for configuration, history, and status reports.

---

## 📚 Documentation & Specifications

- **[`FINAL-PRODUCT-SPEC.md`](FINAL-PRODUCT-SPEC.md):** Product definition, principles, V1 scope, user journeys, functional & non-functional requirements, and acceptance criteria.
- **[`ARCHITECTURE.md`](ARCHITECTURE.md):** Comprehensive technical architecture covering system overview, database schema, native Android/macOS agent design, and protocol definitions.
- **[`BUILD-PLAN.md`](BUILD-PLAN.md):** Phased delivery roadmap (Phase 0 to Phase 7), testing strategy, and risk mitigations.
- **[`AGENTS.md`](AGENTS.md):** Engineering standards, agile principles, TDD practices, commit conventions, and repository guidelines.

---

## 🏛️ Core Principles

1. **Earned Access:** Distractions are blocked by default and unlocked using points earned from focus sessions, completed tasks, or verified physical activity.
2. **One Source of Truth:** All online balance changes commit to an immutable, append-only server ledger.
3. **Strong but Recoverable:** Resists impulsive bypass while maintaining a deliberate, documented recovery path.
4. **Privacy by Minimization:** Stores dwell times and movement summaries rather than continuous GPS trails.
5. **Offline Continuity:** Cached policy remains active offline; offline spending utilizes bounded server-issued device reserves.
