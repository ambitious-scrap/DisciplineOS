-- PostgreSQL Schema for DisciplineOS

CREATE TABLE IF NOT EXISTS users (
    id UUID PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS devices (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(100) NOT NULL,
    platform VARCHAR(32) NOT NULL,
    push_token TEXT,
    last_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_enforced BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS time_banks (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    balance_seconds INT NOT NULL DEFAULT 0,
    max_seconds INT NOT NULL DEFAULT 14400,
    last_decay_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type VARCHAR(16) NOT NULL, -- earn, spend
    source VARCHAR(32) NOT NULL,
    seconds INT NOT NULL,
    description TEXT,
    device_id UUID REFERENCES devices(id) ON DELETE SET NULL,
    idempotency_key VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_idempotency UNIQUE(user_id, idempotency_key)
);

CREATE TABLE IF NOT EXISTS tasks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(200) NOT NULL,
    description TEXT,
    reward_seconds INT NOT NULL DEFAULT 900,
    evidence_type VARCHAR(32) NOT NULL DEFAULT 'none',
    is_recurring BOOLEAN NOT NULL DEFAULT FALSE,
    recurrence_cron VARCHAR(64),
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS task_occurrences (
    id UUID PRIMARY KEY,
    task_id UUID NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    occurrence_date DATE NOT NULL,
    completed_at TIMESTAMPTZ,
    evidence_url TEXT,
    evidence_sha256 VARCHAR(64),
    reward_claimed BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_task_occurrence_date UNIQUE(task_id, occurrence_date)
);

CREATE TABLE IF NOT EXISTS blocked_apps (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    platform VARCHAR(32) NOT NULL,
    identifier VARCHAR(255) NOT NULL,
    display_name VARCHAR(100) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_app UNIQUE(user_id, platform, identifier)
);

CREATE TABLE IF NOT EXISTS blocked_sites (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    domain VARCHAR(255) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_user_site UNIQUE(user_id, domain)
);

CREATE TABLE IF NOT EXISTS pending_policy_changes (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    action VARCHAR(32) NOT NULL,
    target_id UUID NOT NULL,
    target_description TEXT NOT NULL,
    requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    effective_at TIMESTAMPTZ NOT NULL,
    is_cancelled BOOLEAN NOT NULL DEFAULT FALSE,
    is_executed BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE IF NOT EXISTS active_unlocks (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    unlock_type VARCHAR(32) NOT NULL,
    identifier VARCHAR(255) NOT NULL,
    duration_seconds INT NOT NULL,
    started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expires_at TIMESTAMPTZ NOT NULL,
    is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    lease_signature TEXT NOT NULL
);

-- Index for single active distraction lock per user
CREATE UNIQUE INDEX IF NOT EXISTS uq_user_active_distraction 
ON active_unlocks(user_id) 
WHERE expires_at > NOW();

CREATE TABLE IF NOT EXISTS device_reserves (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    reserved_seconds INT NOT NULL,
    remaining_seconds INT NOT NULL,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS offline_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    reserve_id UUID NOT NULL REFERENCES device_reserves(id) ON DELETE CASCADE,
    target_type VARCHAR(32) NOT NULL,
    target_identifier VARCHAR(255) NOT NULL,
    seconds_spent INT NOT NULL,
    local_timestamp TIMESTAMPTZ NOT NULL,
    is_emergency BOOLEAN NOT NULL DEFAULT FALSE,
    reconciled_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS protection_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    event_type VARCHAR(64) NOT NULL,
    details JSONB,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS location_events (
    id UUID PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    device_id UUID NOT NULL REFERENCES devices(id) ON DELETE CASCADE,
    location_type VARCHAR(32) NOT NULL,
    event_type VARCHAR(16) NOT NULL,
    dwell_seconds INT,
    movement_verified BOOLEAN NOT NULL DEFAULT FALSE,
    occurred_at TIMESTAMPTZ NOT NULL,
    idempotency_key VARCHAR(128),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT uq_location_idempotency UNIQUE(user_id, idempotency_key)
);
