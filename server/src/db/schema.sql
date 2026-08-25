-- DisciplineOS authoritative PostgreSQL schema.
-- All policy, balance, ledger, session, task, reserve, and evidence state lives here.

DROP INDEX IF EXISTS uq_user_active_distraction;

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_lower ON users (LOWER(email));

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'macos')),
    push_token TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_enforced BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_devices_user_id ON devices(user_id);

CREATE TABLE IF NOT EXISTS time_banks (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_seconds INTEGER NOT NULL DEFAULT 0,
    max_seconds INTEGER NOT NULL DEFAULT 14400,
    last_decay_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT time_banks_balance_nonnegative CHECK (balance_seconds >= 0),
    CONSTRAINT time_banks_max_nonnegative CHECK (max_seconds >= 0),
    CONSTRAINT time_banks_balance_within_max CHECK (balance_seconds <= max_seconds)
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type TEXT NOT NULL CHECK (type IN ('earn', 'spend')),
    source TEXT NOT NULL CHECK (
        source IN (
            'task', 'focus', 'gym', 'outside', 'manual', 'usage', 'emergency',
            'decay', 'reserve_allocation', 'reserve_reconciliation', 'compensation'
        )
    ),
    seconds INTEGER NOT NULL CHECK (seconds >= 0),
    description TEXT,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    idempotency_key TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_idempotency UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_created ON ledger_transactions(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    reward_seconds INTEGER NOT NULL DEFAULT 900 CHECK (reward_seconds BETWEEN 60 AND 3600),
    evidence_type TEXT NOT NULL DEFAULT 'none' CHECK (evidence_type IN ('none', 'photo', 'focus_timer')),
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_cron TEXT,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tasks_user_active ON tasks(user_id, is_active);

CREATE TABLE IF NOT EXISTS task_occurrences (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    completed_at TIMESTAMPTZ,
    evidence_url TEXT,
    evidence_sha256 TEXT,
    reward_claimed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT NOT NULL,
    CONSTRAINT uq_task_occurrence_date UNIQUE(task_id, occurrence_date),
    CONSTRAINT uq_task_occurrence_idempotency UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_task_occurrences_user ON task_occurrences(user_id, occurrence_date DESC);

CREATE TABLE IF NOT EXISTS blocked_apps (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform TEXT NOT NULL CHECK (platform IN ('android', 'macos')),
    identifier TEXT NOT NULL,
    display_name TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_app UNIQUE(user_id, platform, identifier)
);

CREATE INDEX IF NOT EXISTS idx_blocked_apps_user_active ON blocked_apps(user_id, is_active);

CREATE TABLE IF NOT EXISTS blocked_sites (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain TEXT NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_site UNIQUE(user_id, domain)
);

CREATE INDEX IF NOT EXISTS idx_blocked_sites_user_active ON blocked_sites(user_id, is_active);

CREATE TABLE IF NOT EXISTS pending_policy_changes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action TEXT NOT NULL CHECK (action IN ('unblock_app', 'unblock_site', 'delete_policy')),
    target_id UUID NOT NULL,
    target_description TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_at TIMESTAMPTZ NOT NULL,
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    is_executed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_pending_policy_user_effective
    ON pending_policy_changes(user_id, effective_at)
    WHERE is_cancelled = FALSE AND is_executed = FALSE;

CREATE UNIQUE INDEX IF NOT EXISTS uq_pending_policy_target
    ON pending_policy_changes(user_id, target_id)
    WHERE is_cancelled = FALSE AND is_executed = FALSE;

CREATE TABLE IF NOT EXISTS active_unlocks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    unlock_type TEXT NOT NULL CHECK (unlock_type IN ('app', 'site', 'focus')),
    identifier TEXT NOT NULL,
    duration_seconds INTEGER NOT NULL CHECK (duration_seconds > 0),
    started_at TIMESTAMPTZ NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    lease_signature TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'active'
      CHECK (status IN ('active', 'expired', 'released', 'cancelled')),
    idempotency_key TEXT NOT NULL,
    CONSTRAINT uq_unlock_idempotency UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_unlocks_user_status ON active_unlocks(user_id, status);

CREATE UNIQUE INDEX IF NOT EXISTS uq_user_active_distraction
    ON active_unlocks(user_id)
    WHERE status = 'active';

CREATE TABLE IF NOT EXISTS device_reserves (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    reserved_seconds INTEGER NOT NULL CHECK (reserved_seconds >= 0),
    remaining_seconds INTEGER NOT NULL CHECK (remaining_seconds >= 0),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    idempotency_key TEXT NOT NULL,
    CONSTRAINT device_reserve_remaining_within_reserved CHECK (remaining_seconds <= reserved_seconds),
    CONSTRAINT uq_reserve_idempotency UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_device_reserves_user_active
    ON device_reserves(user_id, expires_at)
    WHERE remaining_seconds > 0;

CREATE TABLE IF NOT EXISTS offline_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    reserve_id UUID NOT NULL REFERENCES device_reserves(id) ON DELETE CASCADE,
    target_type TEXT NOT NULL CHECK (target_type IN ('app', 'site')),
    target_identifier TEXT NOT NULL,
    seconds_spent INTEGER NOT NULL CHECK (seconds_spent > 0),
    local_timestamp TIMESTAMPTZ NOT NULL,
    is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_offline_events_reserve ON offline_events(reserve_id);

CREATE TABLE IF NOT EXISTS protection_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    details JSONB,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_protection_events_user_created
    ON protection_events(user_id, created_at DESC);

CREATE TABLE IF NOT EXISTS location_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    location_type TEXT NOT NULL CHECK (location_type IN ('home', 'gym', 'custom')),
    event_type TEXT NOT NULL CHECK (event_type IN ('enter', 'exit', 'dwell')),
    dwell_seconds INTEGER CHECK (dwell_seconds IS NULL OR dwell_seconds >= 0),
    movement_verified BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at TIMESTAMPTZ NOT NULL,
    idempotency_key TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_location_idempotency UNIQUE(user_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_location_events_user_occurred
    ON location_events(user_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS location_states (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    last_gym_enter_at TIMESTAMPTZ,
    last_home_exit_at TIMESTAMPTZ,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Migrations for databases created by the pre-authority schema.
ALTER TABLE task_occurrences ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
UPDATE task_occurrences
SET idempotency_key = 'legacy-occurrence-' || id::TEXT
WHERE idempotency_key IS NULL;
ALTER TABLE task_occurrences ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_task_occurrence_idempotency
    ON task_occurrences(user_id, idempotency_key);

ALTER TABLE active_unlocks ADD COLUMN IF NOT EXISTS status TEXT;
UPDATE active_unlocks
SET status = CASE WHEN expires_at > NOW() THEN 'active' ELSE 'expired' END
WHERE status IS NULL;
ALTER TABLE active_unlocks ALTER COLUMN status SET DEFAULT 'active';
ALTER TABLE active_unlocks ALTER COLUMN status SET NOT NULL;
ALTER TABLE active_unlocks ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
UPDATE active_unlocks
SET idempotency_key = 'legacy-unlock-' || id::TEXT
WHERE idempotency_key IS NULL;
ALTER TABLE active_unlocks ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_unlock_idempotency ON active_unlocks(user_id, idempotency_key);

ALTER TABLE device_reserves ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
UPDATE device_reserves
SET idempotency_key = 'legacy-reserve-' || id::TEXT
WHERE idempotency_key IS NULL;
ALTER TABLE device_reserves ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_reserve_idempotency ON device_reserves(user_id, idempotency_key);

ALTER TABLE location_events ADD COLUMN IF NOT EXISTS idempotency_key TEXT;
UPDATE location_events
SET idempotency_key = 'legacy-location-' || id::TEXT
WHERE idempotency_key IS NULL;
ALTER TABLE location_events ALTER COLUMN idempotency_key SET NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_location_idempotency_migrated
    ON location_events(user_id, idempotency_key);
DO $$
BEGIN
    ALTER TABLE time_banks
      ADD CONSTRAINT time_banks_balance_nonnegative_migrated CHECK (balance_seconds >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE time_banks
      ADD CONSTRAINT time_banks_max_nonnegative_migrated CHECK (max_seconds >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE time_banks
      ADD CONSTRAINT time_banks_balance_within_max_migrated CHECK (balance_seconds <= max_seconds);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE ledger_transactions
      ADD CONSTRAINT ledger_seconds_nonnegative_migrated CHECK (seconds >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE active_unlocks
      ADD CONSTRAINT active_unlock_status_migrated
      CHECK (status IN ('active', 'expired', 'released', 'cancelled'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE device_reserves
      ADD CONSTRAINT device_reserve_remaining_nonnegative_migrated CHECK (remaining_seconds >= 0);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$
BEGIN
    ALTER TABLE device_reserves
      ADD CONSTRAINT device_reserve_remaining_within_reserved_migrated
      CHECK (remaining_seconds <= reserved_seconds);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
