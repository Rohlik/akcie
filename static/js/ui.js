// DOM-level UI helpers: messages, field errors, loading states

export function setLoading(elementId, isLoading) {
    const el = document.getElementById(elementId);
    if (!el) return;
    if (isLoading) {
        el.classList.add('loading');
        el.disabled = true;
    } else {
        el.classList.remove('loading');
        el.disabled = false;
    }
}

export function showMessage(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `message message-${type}`;
    div.textContent = message;
    const container = document.querySelector('.container');
    if (!container) return;
    container.insertBefore(div, container.firstChild);
    setTimeout(() => div.remove(), 5000);
}

export function handleError(error, userMessage) {
    console.error(error);
    showMessage(userMessage || 'Došlo k chybě', 'error');
}

export function showFieldError(input, message) {
    const err = document.createElement('div');
    err.className = 'field-error';
    err.textContent = message;
    input.parentNode.appendChild(err);
    input.style.borderColor = 'var(--danger-color)';
}

export function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.remove());
}
