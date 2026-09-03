// DOM-level UI helpers: messages, field errors, loading states

// `.loading` is a cell/text style; busy state is separate so marking a <tbody>
// busy doesn't restyle it as an empty-state cell.
export function setLoading(elementId, isLoading) {
    const el = document.getElementById(elementId);
    if (!el) return;
    el.classList.toggle('is-busy', isLoading);
    el.setAttribute('aria-busy', isLoading ? 'true' : 'false');
    if (el instanceof HTMLButtonElement || el instanceof HTMLInputElement) {
        el.disabled = isLoading;
    }
}

export function showMessage(message, type = 'success') {
    const div = document.createElement('div');
    div.className = `message message-${type}`;
    div.setAttribute('role', type === 'error' ? 'alert' : 'status');
    div.textContent = message;
    const container = document.querySelector('.container');
    if (!container) return;
    container.insertBefore(div, container.firstChild);
    setTimeout(() => div.remove(), 5000);
}

export function handleError(error, userMessage) {
    console.error(error);
    showMessage(userMessage || 'Něco se nepodařilo. Zkuste to prosím znovu.', 'error');
}

let fieldErrorSeq = 0;

export function showFieldError(input, message) {
    const err = document.createElement('div');
    err.className = 'field-error';
    err.id = `field-error-${++fieldErrorSeq}`;
    err.setAttribute('role', 'alert');
    err.textContent = message;
    input.parentNode.appendChild(err);
    input.setAttribute('aria-describedby', err.id);
    input.setAttribute('aria-invalid', 'true');
    input.classList.add('error');
}

export function clearFieldErrors() {
    document.querySelectorAll('.field-error').forEach(el => el.remove());
    document.querySelectorAll('[aria-invalid="true"]').forEach(input => {
        input.removeAttribute('aria-invalid');
        input.removeAttribute('aria-describedby');
        input.classList.remove('error');
    });
}
