const BASE_URL = 'http://localhost:8000';

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
    } catch (e) {
      // ignore
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
  
  getLogs: async (source, limit, token) => {
    let params = new URLSearchParams();
    if (source && source !== 'all') params.append('source', source);
    if (limit) params.append('limit', limit);
    
    const qs = params.toString();
    const url = qs ? `/logs?${qs}` : '/logs';
    return fetchWithAuth(url, {}, token);
  },
  
  connectWebSocket: (token, onMessage) => {
    const ws = new WebSocket(`ws://localhost:8000/ws/dashboard?token=${token}`);
    
    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onMessage(data);
      } catch (e) {
        console.error("Error parsing WS message", e);
      }
    };
    
    ws.onerror = (err) => {
      console.error("WebSocket error", err);
    };
    
    return ws;
  }
};
