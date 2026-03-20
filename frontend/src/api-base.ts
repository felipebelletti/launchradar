const raw = import.meta.env.VITE_API_URL;
export const API_BASE_URL =
  (typeof raw === 'string' && raw.trim() !== ''
    ? raw.trim()
    : import.meta.env.DEV
      ? '/api'
      : '');
