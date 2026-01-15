// Simple API client wrapper
// In production, you might want to use axios or fetch with more configuration

interface RequestOptions {
  method?: string;
  headers?: Record<string, string>;
  body?: any;
}

class ApiClient {
  private baseURL: string;

  constructor() {
    this.baseURL = window.location.origin;
  }

  async request(url: string, options: RequestOptions = {}) {
    const { method = 'GET', headers = {}, body } = options;

    const config: RequestInit = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...headers,
      },
    };

    if (body) {
      config.body = JSON.stringify(body);
    }

    const response = await fetch(`${this.baseURL}${url}`, config);

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: 'Request failed' }));
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return {
      data: await response.json(),
      status: response.status,
    };
  }

  get(url: string, options?: RequestOptions) {
    return this.request(url, { ...options, method: 'GET' });
  }

  post(url: string, body?: any, options?: RequestOptions) {
    return this.request(url, { ...options, method: 'POST', body });
  }

  put(url: string, body?: any, options?: RequestOptions) {
    return this.request(url, { ...options, method: 'PUT', body });
  }

  delete(url: string, options?: RequestOptions) {
    return this.request(url, { ...options, method: 'DELETE' });
  }
}

export const api = new ApiClient();
