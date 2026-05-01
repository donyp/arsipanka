// ============================================================
// API Client — JWT-based HTTP wrapper
// Replaces the old supabase.js (Supabase client init)
// ============================================================

const API = {
    /**
     * Get stored JWT token
     */
    getToken() {
        return localStorage.getItem('jwt_token');
    },

    /**
     * Get stored user object
     */
    getUser() {
        const raw = localStorage.getItem('user_data');
        return raw ? JSON.parse(raw) : null;
    },

    /**
     * Store auth data after login
     */
    setAuth(token, user) {
        localStorage.setItem('jwt_token', token);
        localStorage.setItem('user_data', JSON.stringify(user));
    },

    /**
     * Get or create a unique device session ID
     */
    getSessionId() {
        let sid = localStorage.getItem('device_session_id');
        if (!sid) {
            sid = 'sid_' + Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
            localStorage.setItem('device_session_id', sid);
        }
        return sid;
    },

    /**
     * Clear auth data on logout
     */
    clearAuth() {
        localStorage.removeItem('jwt_token');
        localStorage.removeItem('user_data');
    },

    /**
     * Generic fetch wrapper with JWT header
     */
    async request(endpoint, options = {}) {
        const token = this.getToken();
        const url = `${CONFIG.API_URL}${endpoint}`;

        const headers = {
            ...(options.headers || {})
        };

        // Don't set Content-Type for FormData (browser sets multipart boundary)
        if (!(options.body instanceof FormData)) {
            headers['Content-Type'] = 'application/json';
        }

        if (token) {
            headers['Authorization'] = `Bearer ${token}`;
        }

        // Include Session ID for device tracking
        headers['X-Session-ID'] = this.getSessionId();

        const res = await fetch(url, {
            ...options,
            headers
        });

        // AUTO-logout on 401/403 expired token
        if (res.status === 401 || res.status === 403) {
            const body = await res.json().catch(() => ({}));
            if (body.error?.includes('expired') || body.error?.includes('Token')) {
                this.clearAuth();
                window.location.href = 'index.html';
                throw new Error('Sesi Anda telah berakhir. Silakan login kembali.');
            }
            throw new Error(body.error || 'Akses ditolak.');
        }

        if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error || `HTTP Error ${res.status}`);
        }

        // For file downloads, return the raw response
        if (options.rawResponse) {
            return res;
        }

        return res.json();
    },

    // ---- Shorthand Methods ----
    get(endpoint) {
        return this.request(endpoint, { method: 'GET' });
    },

    post(endpoint, body) {
        return this.request(endpoint, {
            method: 'POST',
            body: JSON.stringify(body)
        });
    },

    put(endpoint, body) {
        return this.request(endpoint, {
            method: 'PUT',
            body: JSON.stringify(body)
        });
    },

    del(endpoint, body) {
        return this.request(endpoint, {
            method: 'DELETE',
            body: body ? JSON.stringify(body) : undefined
        });
    },

    /**
     * Upload file (FormData)
     */
    upload(endpoint, formData) {
        return this.request(endpoint, {
            method: 'POST',
            body: formData // No Content-Type — browser sets it with boundary
        });
    }
};
