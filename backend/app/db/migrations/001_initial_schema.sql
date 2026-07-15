-- =============================================================================
-- Migration 001: Initial Schema
-- Project:  IncidentOps – Real-Time Incident Management Platform
-- =============================================================================

-- ---------------------------------------------------------------------------
-- logs
--   Raw ingested log lines from all monitored services.
-- ---------------------------------------------------------------------------
CREATE TABLE logs (
    id               SERIAL PRIMARY KEY,
    source           VARCHAR(50),
    level            VARCHAR(10),
    message          TEXT,
    response_time_ms INTEGER,
    status_code      INTEGER,
    payload          JSONB,
    created_at       TIMESTAMP DEFAULT NOW()
);

-- ---------------------------------------------------------------------------
-- incidents
--   Auto-detected or manually raised incidents, optionally linked to a
--   triggering log entry and enriched with an AI-generated summary.
-- ---------------------------------------------------------------------------
CREATE TABLE incidents (
    id               SERIAL PRIMARY KEY,
    title            VARCHAR(200),
    source           VARCHAR(50),
    trigger_reason   VARCHAR(100),
    metric_value     FLOAT,
    threshold_value  FLOAT,
    status           VARCHAR(20) DEFAULT 'open',
    ai_summary       TEXT,
    last_log_id      INTEGER REFERENCES logs(id),
    created_at       TIMESTAMP DEFAULT NOW(),
    acknowledged_at  TIMESTAMP,
    resolved_at      TIMESTAMP
);

-- ---------------------------------------------------------------------------
-- consumer_state
--   Tracks the Redis Stream cursor position for each background consumer
--   so it can resume safely after a restart.
-- ---------------------------------------------------------------------------
CREATE TABLE consumer_state (
    consumer_name   VARCHAR(50) PRIMARY KEY,
    last_stream_id  VARCHAR(30),
    updated_at      TIMESTAMP DEFAULT NOW()
);
