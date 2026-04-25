// Fetch wrapper that attaches the CSRF token for mutating requests.

let csrfToken = null;

export async function getCsrfToken() {
    if (csrfToken) return csrfToken;
    try {
        const response = await fetch('/api/csrf-token');
        const data = await response.json();
        csrfToken = data.csrf_token;
    } catch (err) {
        console.error('Failed to get CSRF token:', err);
    }
    return csrfToken;
}

export async function csrfFetch(url, options = {}) {
    const token = await getCsrfToken();
    const headers = { ...(options.headers || {}) };
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    if (token) headers['X-CSRFToken'] = token;
    return fetch(url, { ...options, headers });
}

export async function readJson(response) {
    try {
        return await response.json();
    } catch {
        return null;
    }
}

export function extractErrorMessage(data, fallback) {
    return data?.error?.message || data?.error || fallback;
}
