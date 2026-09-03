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

async function sendWithToken(url, options) {
    const token = await getCsrfToken();
    const headers = { ...(options.headers || {}) };
    if (options.body && typeof options.body === 'string' && !headers['Content-Type']) {
        headers['Content-Type'] = 'application/json';
    }
    if (token) headers['X-CSRFToken'] = token;
    return fetch(url, { ...options, headers });
}

export async function csrfFetch(url, options = {}) {
    let response = await sendWithToken(url, options);

    // Tokens expire after an hour, which a dashboard left open will hit. On a
    // rejection, drop the cached token and retry once with a fresh one rather
    // than failing every write until the page is reloaded.
    if (response.status === 400) {
        const clone = response.clone();
        const data = await clone.json().catch(() => null);
        if (data?.error?.code === 'CSRF_ERROR') {
            csrfToken = null;
            response = await sendWithToken(url, options);
        }
    }

    return response;
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
