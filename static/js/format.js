// Formatting helpers shared across the portfolio list, the transaction
// history and the add-transaction form.

const currencyFmt = new Intl.NumberFormat('cs-CZ', {
    style: 'currency', currency: 'CZK',
    minimumFractionDigits: 2, maximumFractionDigits: 2,
});
const numberFmt = new Intl.NumberFormat('cs-CZ');

export function formatCurrency(value) {
    if (value === null || value === undefined) return '-';
    return currencyFmt.format(value);
}

// Profit/loss columns always carry an explicit sign.
export function formatSignedCurrency(value) {
    if (value === null || value === undefined) return '-';
    return `${value >= 0 ? '+' : ''}${currencyFmt.format(value)}`;
}

// Percent change against a cost basis, guarding a zero or missing basis.
export function percentOfCost(value, totalCost) {
    if (!totalCost || totalCost <= 0) return 0;
    return (value / totalCost) * 100;
}

export function formatNumber(value) {
    if (value === null || value === undefined) return '-';
    return numberFmt.format(value);
}

// YYYY-MM-DD → DD.MM.YYYY
export function formatIsoDateCs(iso) {
    if (!iso) return '';
    const parts = iso.split('-');
    return parts.length === 3 ? `${parts[2]}.${parts[1]}.${parts[0]}` : iso;
}

// DD.MM.YYYY → YYYY-MM-DD. Returns null if the input is not a real calendar date.
// Strict: the form and edit flows rely on this to reject invalid input instead of
// silently forwarding malformed dates to the API.
export function parseCsDateToIso(text) {
    if (!text) return null;
    const match = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
    if (!match) return null;
    const day = parseInt(match[1], 10);
    const month = parseInt(match[2], 10);
    const year = parseInt(match[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(year, month - 1, day);
    if (d.getFullYear() !== year || d.getMonth() !== month - 1 || d.getDate() !== day) return null;
    const mm = String(month).padStart(2, '0');
    const dd = String(day).padStart(2, '0');
    return `${year}-${mm}-${dd}`;
}

// Shared flatpickr config so the "Add transaction" form and the inline
// edit-row picker stay in lockstep.
export function csDatePickerOptions(defaultDate) {
    return {
        locale: 'cs',
        dateFormat: 'd.m.Y',
        firstDayOfWeek: 1,
        defaultDate,
        allowInput: true,
        parseDate: datestr => {
            const iso = parseCsDateToIso(datestr);
            if (!iso) return null;
            const [y, m, d] = iso.split('-').map(Number);
            return new Date(y, m - 1, d);
        },
        formatDate: date => {
            const d = String(date.getDate()).padStart(2, '0');
            const m = String(date.getMonth() + 1).padStart(2, '0');
            return `${d}.${m}.${date.getFullYear()}`;
        },
    };
}

export function transactionTotalValue(tx) {
    const fees = tx.fees || 0;
    const gross = tx.price * tx.quantity;
    return tx.type === 'buy' ? gross + fees : gross - fees;
}

export function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
