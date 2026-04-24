// Light / dark / auto theme toggle. Emits a "themechange" CustomEvent on
// document whenever the effective theme may have changed — charts listen
// and refresh their color scales.

const COOKIE_NAME = 'theme';
const COOKIE_MAX_AGE = 365 * 24 * 60 * 60;

const ICONS = { light: '☀️', dark: '🌙', auto: '💻' };
const LABELS = { light: 'Světlý', dark: 'Tmavý', auto: 'Auto' };
const TITLES = {
    light: 'Motiv: Světlý (klikněte pro tmavý)',
    dark: 'Motiv: Tmavý (klikněte pro automatický)',
    auto: 'Motiv: Automatický (klikněte pro světlý)',
};
const CYCLE = ['auto', 'light', 'dark'];

let currentMode = (typeof window !== 'undefined' && window.__themeMode) || 'auto';

function readCookie() {
    const match = document.cookie.match(/(?:^|;\s*)theme=([^;]*)/);
    return match ? match[1] : null;
}

function writeCookie(value) {
    document.cookie = `${COOKIE_NAME}=${value};path=/;max-age=${COOKIE_MAX_AGE};SameSite=Lax`;
}

function resolveTheme(mode) {
    if (mode === 'light' || mode === 'dark') return mode;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function applyTheme(theme) {
    if (theme === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
    } else {
        document.documentElement.removeAttribute('data-theme');
    }
}

function updateButton() {
    const iconEl = document.getElementById('theme-icon');
    const labelEl = document.getElementById('theme-label');
    const btn = document.getElementById('theme-toggle');
    if (iconEl) iconEl.textContent = ICONS[currentMode];
    if (labelEl) labelEl.textContent = LABELS[currentMode];
    if (btn) btn.title = TITLES[currentMode];
}

function emitChange() {
    document.dispatchEvent(new CustomEvent('themechange'));
}

export function isDark() {
    return resolveTheme(currentMode) === 'dark';
}

export function getChartTextColor() {
    return isDark() ? '#cbd5e1' : '#374151';
}

export function getChartGridColor() {
    return isDark() ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.05)';
}

export function toggleTheme() {
    const idx = CYCLE.indexOf(currentMode);
    currentMode = CYCLE[(idx + 1) % CYCLE.length];
    writeCookie(currentMode);
    applyTheme(resolveTheme(currentMode));
    updateButton();
    emitChange();
}

export function initTheme() {
    const saved = readCookie();
    currentMode = (saved === 'light' || saved === 'dark' || saved === 'auto') ? saved : 'auto';
    applyTheme(resolveTheme(currentMode));
    updateButton();

    if (typeof Chart !== 'undefined') {
        Chart.defaults.color = getChartTextColor();
    }

    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentMode === 'auto') {
            applyTheme(resolveTheme('auto'));
            emitChange();
        }
    });

    const btn = document.getElementById('theme-toggle');
    if (btn) btn.addEventListener('click', toggleTheme);

    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            document.body.classList.add('theme-transition');
        });
    });
}
