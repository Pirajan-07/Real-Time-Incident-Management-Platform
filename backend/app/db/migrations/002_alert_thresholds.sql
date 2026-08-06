-- =============================================================================
-- Migration 002: Alert Thresholds
-- Project:  IncidentOps – Real-Time Incident Management Platform
--
-- Moves the worker's anomaly-detection thresholds out of hardcoded constants
-- (app/worker.py) into a single configurable row, editable from the Admin UI.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- alert_thresholds
--   Singleton row (id is pinned to 1 via CHECK) holding the tunable values
--   for the worker's three detection rules.
-- ---------------------------------------------------------------------------
CREATE TABLE alert_thresholds (
    id                     SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    error_rate_threshold   FLOAT NOT NULL DEFAULT 10.0,   -- % error rate that triggers error_rate_spike
    error_rate_min_total   INTEGER NOT NULL DEFAULT 20,   -- min log count in window before the rule can fire
    latency_multiplier     FLOAT NOT NULL DEFAULT 2.0,    -- avg_rt must exceed N x the 24h baseline
    burst_error_threshold  INTEGER NOT NULL DEFAULT 5,    -- N errors within the burst window triggers failure_burst
    updated_at             TIMESTAMP DEFAULT NOW()
);

INSERT INTO alert_thresholds (id) VALUES (1);
