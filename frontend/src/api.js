// VITE_API_URL points at the deployed backend in production;
// defaults to the local FastAPI dev server. WS_BASE_URL is derived from it.
const BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const WS_BASE_URL = BASE_URL.replace(/^http/, 'ws');

async function fetchWithAuth(url, options = {}, token) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const response = await fetch(`${BASE_URL}${url}`, { ...options, headers });
  if (!response.ok) {
    let errMessage = response.statusText;
    try {
      const errorData = await response.json();
      errMessage = errorData.detail || errMessage;
    } catch {
      // response body wasn't JSON — fall back to statusText
    }
    throw new Error(errMessage);
  }
  return response.json();
}

/**
 * Polls GET /health (no auth, no CORS preflight) until the backend responds
 * with HTTP 200, then resolves. Rejects after maxAttempts.
 * onTick(secondsRemaining) is called each second while counting down between polls.
 */
export async function waitForBackend({ onTick, pollInterval = 10000, maxAttempts = 18 } = {}) {
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const res = await fetch(`${BASE_URL}/health`, { method: 'GET' });
      if (res.ok) return; // backend is up
    } catch {
      // still down — wait and retry
    }
    if (attempt === maxAttempts) throw new Error('Backend did not start in time.');
    let remaining = Math.round(pollInterval / 1000);
    await new Promise((resolve) => {
      const iv = setInterval(() => {
        remaining -= 1;
        if (onTick) onTick(remaining);
        if (remaining <= 0) { clearInterval(iv); resolve(); }
      }, 1000);
    });
  }
}

export const api = {
  login: async (email, password) => {
    return fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  },

  getIncidents: async (status, token) => {
    const url = status && status !== 'all' ? `/incidents?status=${status}` : '/incidents';
    return fetchWithAuth(url, {}, token);
  },

  getIncidentDetail: async (id, token) => {
    return fetchWithAuth(`/incidents/${id}`, {}, token);
  },

  updateIncidentStatus: async (id, status, token) => {
    return fetchWithAuth(`/incidents/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    }, token);
  },

  getLogs: async (source, level, since, limit, token) => {
    const params = new URLSearchParams();
    if (source && source !== 'all') params.append('source', source);
    if (level && level !== 'all') params.append('level', level);
    if (since) params.append('since', since);
    if (limit) params.append('limit', limit);
    const qs = params.toString();
    return fetchWithAuth(qs ? `/logs?${qs}` : '/logs', {}, token);
  },

  getLogCount: async (since, token) => {
    const params = new URLSearchParams();
    if (since) params.append('since', since);
    return fetchWithAuth(`/logs/count?${params.toString()}`, {}, token);
  },

  getMetricsTimeseries: async (token) => {
    return fetchWithAuth('/metrics/timeseries', {}, token);
  },

  getThresholds: async (token) => {
    return fetchWithAuth('/settings/thresholds', {}, token);
  },

  updateThresholds: async (payload, token) => {
    return fetchWithAuth('/settings/thresholds', {
      method: 'PUT',
      body: JSON.stringify(payload),
    }, token);
  },

  connectWebSocket: (token, onMessage) => {
    // Exponential backoff: 5s -> 10s -> ... -> 60s cap, max 8 retries.
    // Capped retries prevent hammering a cold-starting Render free-tier backend.
    const MIN_DELAY = 5000;
    const MAX_DELAY = 60000;
    const MAX_RETRIES = 8;
    let delay = MIN_DELAY;
    let ws = null;
    let stopped = false;
    let retryTimer = null;
    let retries = 0;

    function connect() {
      if (stopped || !token) return;
      ws = new WebSocket(`${WS_BASE_URL}/ws/dashboard?token=${token}`);

      ws.onopen = () => {
        console.log('[WS] Connected to dashboard');
        delay = MIN_DELAY;
        retries = 0;
      };
      ws.onmessage = (event) => {
        try { onMessage(JSON.parse(event.data)); }
        catch (e) { console.error('[WS] Failed to parse message:', e); }
      };
      ws.onerror = (err) => { console.warn('[WS] Socket error:', err); };
      ws.onclose = (event) => {
        if (stopped) return;
        retries += 1;
        if (retries > MAX_RETRIES) {
          console.warn(`[WS] Giving up after ${MAX_RETRIES} retries.`);
          onMessage({ type: '_ws_gave_up' });
          return;
        }
        console.warn(`[WS] Disconnected. Retry ${retries}/${MAX_RETRIES} in ${delay / 1000}s...`);
        retryTimer = setTimeout(() => {
          delay = Math.min(delay * 2, MAX_DELAY);
          connect();
        }, delay);
      };
    }

    connect();

    return {
      close() {
        stopped = true;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        if (ws) { ws.close(); ws = null; }
      },
    };
  },
};
