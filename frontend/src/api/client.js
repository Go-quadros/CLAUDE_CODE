const BASE = import.meta.env.VITE_API_URL || '';

async function req(method, path, body) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    credentials: 'include',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) {
    window.location.href = '/login';
    throw new Error('Não autenticado');
  }
  return res.json();
}

export const api = {
  get:    (path)        => req('GET',    path),
  post:   (path, body)  => req('POST',   path, body),
  put:    (path, body)  => req('PUT',    path, body),
  delete: (path)        => req('DELETE', path),
};

// Auth
export const getMe          = ()         => api.get('/api/auth/me');
export const login          = (body)     => api.post('/api/auth/login', body);
export const logout         = ()         => api.post('/api/auth/logout');

// Users
export const getUsers       = ()         => api.get('/api/users');
export const createUser     = (body)     => api.post('/api/users', body);
export const deleteUser     = (u)        => api.delete(`/api/users/${u}`);
export const changePassword = (u, body)  => api.put(`/api/users/${u}/password`, body);
export const renameUser     = (u, body)  => api.put(`/api/users/${u}/rename`, body);

// ML
export const getAccounts    = ()         => api.get('/api/ml/accounts');
export const connectML      = (key)      => api.get(`/api/ml/connect/${key}`);

// Orders
export const getOrders      = (params)   => api.get(`/api/orders?${new URLSearchParams(params)}`);

// Clips
export const getClips       = ()         => api.get('/api/clips');
export const removeClip     = (id)       => api.delete(`/api/clips/${id}`);
export const bulkAddClips   = (ids)      => api.post('/api/clips/bulk', { ids });
export const bulkRemoveClips= (ids)      => api.post('/api/clips/bulk-remove', { ids });

// Sales
export const collectSales   = (params)   => api.get(`/api/sales/collect?${new URLSearchParams(params)}`);
export const saveManual     = (body)     => api.post('/api/sales/manual', body);
export const getManual      = ()         => api.get('/api/sales/manual');

// Ads
export const getAdsGap      = (key)      => api.get(`/api/ads/${key}`);
export const getAdsConfig   = (key)      => api.get(`/api/ads/config/${key}`);
export const saveAdsItems   = (key, b)   => api.post(`/api/ads/config/${key}/items`, b);

// Titles
export const generateTitle  = (body)     => api.post('/api/titulos/gerar', body);
export const getExistingTitles = ()      => api.get('/api/titulos/existentes');
