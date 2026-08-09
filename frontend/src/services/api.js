import axios from 'axios';

// Use relative base URL so all API requests match current origin or proxy seamlessly
const API_BASE_URL = '';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 45000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Request Interceptor: Attach JWT Bearer Token if present
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('legalbot_access_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// Response Interceptor: Handle 401 Unauthenticated & API errors cleanly
api.interceptors.response.use(
  (response) => response,
  (error) => {
    if (error.response && error.response.status === 401) {
      // Clear expired token if auth failure
      localStorage.removeItem('legalbot_access_token');
    }
    return Promise.reject(error);
  }
);

// --- Auth Endpoints ---
export const loginUser = async (email, password) => {
  const response = await api.post('/auth/login', { email, password });
  if (response.data.access_token) {
    localStorage.setItem('legalbot_access_token', response.data.access_token);
  }
  return response.data;
};

export const signupUser = async (email, password, fullName) => {
  const response = await api.post('/auth/signup', {
    email,
    password,
    full_name: fullName,
  });
  return response.data;
};

export const fetchUserProfile = async () => {
  const response = await api.get('/auth/me');
  return response.data;
};

export const logoutUser = () => {
  localStorage.removeItem('legalbot_access_token');
};

// --- Document Management Endpoints ---
export const uploadDocument = async (file) => {
  const formData = new FormData();
  formData.append('file', file);
  const response = await api.post('/docs/upload', formData, {
    headers: {
      'Content-Type': 'multipart/form-data',
    },
  });
  return response.data;
};

export const fetchDocuments = async () => {
  const response = await api.get('/docs/');
  return response.data;
};

export const deleteDocument = async (docId) => {
  const response = await api.delete(`/docs/${docId}`);
  return response.data;
};

export const fetchDocumentChunks = async (docId) => {
  const response = await api.get(`/docs/${docId}/chunks`);
  return response.data;
};

// --- AI Analysis & Report Endpoints ---
export const triggerDocumentAnalysis = async (docId) => {
  const response = await api.post(`/reports/analyze/${docId}`);
  return response.data;
};

export const fetchDocumentReport = async (docId) => {
  const response = await api.get(`/reports/doc/${docId}`);
  return response.data;
};

// --- System Diagnostics Endpoint ---
export const fetchSystemDiagnostics = async () => {
  const response = await api.get('/tests/all');
  return response.data;
};

// --- Admin Panel Endpoints ---
export const fetchAdminRules = async () => {
  const response = await api.get('/admin/rules');
  return response.data;
};

export const createAdminRule = async (ruleData) => {
  const response = await api.post('/admin/rules', ruleData);
  return response.data;
};

export const updateAdminRule = async (ruleId, ruleData) => {
  const response = await api.put(`/admin/rules/${ruleId}`, ruleData);
  return response.data;
};

export const deleteAdminRule = async (ruleId) => {
  const response = await api.delete(`/admin/rules/${ruleId}`);
  return response.data;
};

export const fetchAdminUsers = async () => {
  const response = await api.get('/admin/users');
  return response.data;
};

export const updateUserRole = async (userId, role) => {
  const response = await api.put(`/admin/users/${userId}/role`, { role });
  return response.data;
};

export const toggleUserActive = async (userId) => {
  const response = await api.put(`/admin/users/${userId}/active`);
  return response.data;
};

export const fetchAdminStats = async () => {
  const response = await api.get('/admin/stats');
  return response.data;
};

export default api;
