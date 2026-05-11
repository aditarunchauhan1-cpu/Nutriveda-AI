const rawBackendUrl = import.meta.env.VITE_BACKEND_URL?.trim();

export const API_BASE_URL = rawBackendUrl
  ? (rawBackendUrl.startsWith('http://') || rawBackendUrl.startsWith('https://') ? rawBackendUrl : `http://${rawBackendUrl}`)
  : 'http://localhost:3000';

export async function readError(response) {
  try {
    const data = await response.json();
    if (Array.isArray(data.details)) return data.details.join(' ');
    return data.details || data.error || 'Request failed.';
  } catch {
    return 'Request failed.';
  }
}

export function getUserToken() {
  return localStorage.getItem('authToken') || '';
}

export function getAdminToken() {
  return localStorage.getItem('adminToken') || '';
}

export async function apiFetch(path, options = {}) {
  const headers = {
    ...(options.headers || {}),
  };

  const token = options.admin ? getAdminToken() : getUserToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers,
  });

  if (!response.ok) throw new Error(await readError(response));
  return response;
}

export async function apiJson(path, options = {}) {
  const response = await apiFetch(path, options);
  return response.json();
}

export async function apiJsonBody(path, body, options = {}) {
  return apiJson(path, {
    ...options,
    method: options.method || 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    body: JSON.stringify(body),
  });
}
