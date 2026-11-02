// VITE_API_URL points at the deployed backend (Railway, etc.) in production;
// defaults to the local FastAPI dev server. WS_BASE_URL is derived from it
// (http -> ws, https -> wss) so only one URL needs configuring.
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
  
  const response = await fetch(`${BASE_URL}${url}`, {
    ...options,
    headers,
  });
  
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

export const api = {
  login: async (email, password) => {
    return fetchWithAuth('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
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
      body: JSON.stringify({ status })
    }, token);
  },
  
  getLogs: async (source, level, since, limit, token) => {
    let params = new URLSearchParams();
    if (source && source !== 'all') params.append('source', source);
    if (level && level !== 'all') params.append('level', level);
    if (since) params.append('since', since);
    if (limit) params.append('limit', limit);
    
    const qs = params.toString();
    const url = qs ? `/logs?${qs}` : '/logs';
    return fetchWithAuth(url, {}, token);
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
    // Returns a controller { close() } that stops reconnection cleanly.
    // Reconnects with exponential backoff (5 s -> 10 s -> ... -> 60 s cap) on
    // any close or error. Stops immediately when close() is called (e.g.
    // Dashboard unmount or logout -- no token guard prevents zombie loops).
    // MAX_RETRIES prevents hammering a cold-starting backend (e.g. Render
    // free tier) into a restart loop; the user can reload once the backend is up.
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
        delay = MIN_DELAY; // reset backoff after a successful handshake
        retries = 0;
      };

      ws.onmessage = (event) => {
        try {
          onMessage(JSON.parse(event.data));
        } catch (e) {
          console.error('[WS] Failed to parse message:', e);
        }
      };

      ws.onerror = (err) => {
        // onerror always fires before onclose -- log here, retry in onclose
        console.warn('[WS] Socket error:', err);
      };

      ws.onclose = (event) => {
        if (stopped) return; // intentional .close() call -- do not retry
        retries += 1;
        if (retries > MAX_RETRIES) {
          console.warn(
            `[WS] Giving up after ${MAX_RETRIES} retries. ` +
            'Backend may still be cold-starting -- reload the page once it is up.'
          );
          onMessage({ type: '_ws_gave_up' });
          return;
        }
        console.warn(
          `[WS] Disconnected (code=${event.code}, reason="${event.reason}"). ` +
          `Retry ${retries}/${MAX_RETRIES} in ${delay / 1000}s...`
        );
        retryTimer = setTimeout(() => {
          delay = Math.min(delay * 2, MAX_DELAY);
          connect();
        }, delay);
      };
    }

    connect(); // initiate first connection immediately

    return {
      /** Call this to permanently stop the socket and all pending retries. */
      close() {
        stopped = true;
        if (retryTimer) {
          clearTimeout(retryTimer);
          retryTimer = null;
        }
        if (ws) {
          ws.close();
          ws = null;
        }
      },
    };
  },
};
