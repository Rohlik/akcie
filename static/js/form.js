// "Přidat transakci": type switch, required-field validation, sell cap,
// submission, and the phone bottom sheet.

import { formatNumber, parseCsDateToIso, csDatePickerOptions, escapeHtml } from './format.js';
import { csrfFetch, readJson, extractErrorMessage } from './api.js';
import { showMessage, showFieldError, clearFieldErrors, handleError, setLoading } from './ui.js';
import { loadHoldings, getAvailableSellQuantities } from './holdings.js';
import { loadTaxInfo } from './tax.js';
import { reloadDataAfterMutation } from './transactions.js';

function currentType() {
    return document.getElementById('type')?.value || 'buy';
}

function stockNameInput() {
    return currentType() === 'sell'
        ? document.getElementById('stock_name_select')
        : document.getElementById('stock_name');
}

function setType(type) {
    const hidden = document.getElementById('type');
    if (hidden) hidden.value = type;

    const buy = document.getElementById('type-buy');
    const sell = document.getElementById('type-sell');
    if (buy) buy.setAttribute('aria-pressed', String(type === 'buy'));
    if (sell) sell.setAttribute('aria-pressed', String(type === 'sell'));

    const submit = document.getElementById('submit-btn');
    if (submit) submit.textContent = type === 'sell' ? 'Přidat prodej' : 'Přidat nákup';

    updateStockNameField();
}

function updateStockNameField() {
    const selling = currentType() === 'sell';
    const textInput = document.getElementById('stock_name');
    const selectInput = document.getElementById('stock_name_select');
    const textLabel = document.getElementById('stock_name_label');
    const selectLabel = document.getElementById('stock_name_select_label');
    if (!textInput || !selectInput) return;

    // Each control keeps its own <label for>, so whichever one is showing is
    // the one that is labelled.
    textInput.hidden = selling;
    textInput.toggleAttribute('required', !selling);
    selectInput.hidden = !selling;
    selectInput.toggleAttribute('required', selling);
    if (textLabel) textLabel.hidden = selling;
    if (selectLabel) selectLabel.hidden = !selling;

    if (selling) loadAvailableStocks();
}

async function loadAvailableStocks() {
    try {
        const response = await fetch('/api/holdings');
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Nepodařilo se načíst pozice'));
        }

        const selectInput = document.getElementById('stock_name_select');
        const available = data.holdings.filter(h => h.quantity > 0);

        selectInput.innerHTML = '<option value="">Vyberte akcii…</option>' +
            available.map(h => {
                const safe = escapeHtml(h.stock_name);
                return `<option value="${safe}" data-available-qty="${h.quantity}">${safe} (${formatNumber(h.quantity)} ks)</option>`;
            }).join('');

        if (!selectInput.dataset.qtyListeners) {
            selectInput.dataset.qtyListeners = '1';
            selectInput.addEventListener('change', () => updateSellQuantityLimit(true));
            document.getElementById('quantity')?.addEventListener('input', () => {
                if (currentType() === 'sell') updateSellQuantityLimit(true);
            });
        }

        updateSellQuantityLimit(false);
    } catch (error) {
        handleError(error, 'Dostupné akcie se nepodařilo načíst.');
    }
}

function updateSellQuantityLimit(showErrors) {
    if (currentType() !== 'sell') return;
    const selectInput = document.getElementById('stock_name_select');
    const quantityInput = document.getElementById('quantity');
    if (!selectInput || !quantityInput) return;

    const stockName = selectInput.value;
    const selectedOption = selectInput.options[selectInput.selectedIndex];
    const available = getAvailableSellQuantities();
    const maxQty = stockName
        ? (available[stockName] ?? parseInt(selectedOption?.getAttribute('data-available-qty') || '0', 10))
        : null;

    if (maxQty !== null && !Number.isNaN(maxQty) && maxQty > 0) {
        quantityInput.setAttribute('max', String(maxQty));
    } else {
        quantityInput.removeAttribute('max');
    }

    if (showErrors) validateSellQuantityAgainstHoldings(true);
}

function validateSellQuantityAgainstHoldings(showErrors) {
    if (currentType() !== 'sell') return true;
    const selectInput = document.getElementById('stock_name_select');
    const quantityInput = document.getElementById('quantity');
    if (!selectInput || !quantityInput) return true;

    const stockName = selectInput.value;
    if (!stockName) return true;

    const maxQty = getAvailableSellQuantities()[stockName] ?? 0;
    const qty = parseInt(quantityInput.value, 10) || 0;

    if (maxQty > 0 && qty > maxQty) {
        if (showErrors) {
            showFieldError(quantityInput, `Držíte jen ${formatNumber(maxQty)} ks. Zadejte nejvýše tolik.`);
        }
        return false;
    }
    return true;
}

function validateForm() {
    const nameInput = stockNameInput();
    const priceInput = document.getElementById('price');
    const quantityInput = document.getElementById('quantity');
    const dateInput = document.getElementById('date');
    const feesInput = document.getElementById('fees');

    clearFieldErrors();
    let valid = true;

    if (!nameInput.value.trim()) {
        showFieldError(nameInput, 'Vyberte akcii');
        valid = false;
    }

    const isoDate = parseCsDateToIso(dateInput.value);
    if (!isoDate) {
        showFieldError(dateInput, 'Zadejte datum ve formátu DD.MM.RRRR');
        valid = false;
    }

    const price = parseFloat(priceInput.value);
    if (!price || price <= 0) {
        showFieldError(priceInput, 'Cena musí být větší než 0');
        valid = false;
    }

    const quantity = parseInt(quantityInput.value, 10);
    if (!quantity || quantity <= 0) {
        showFieldError(quantityInput, 'Množství musí být větší než 0');
        valid = false;
    }

    if (!validateSellQuantityAgainstHoldings(true)) valid = false;

    const fees = parseFloat(feesInput.value) || 0;
    if (fees < 0) {
        showFieldError(feesInput, 'Poplatky nemohou být záporné');
        valid = false;
    }

    if (!valid) {
        document.querySelector('[aria-invalid="true"]')?.focus();
    }

    return { valid, isoDate };
}

// --- phone bottom sheet ------------------------------------------------------

function openSheet() {
    document.body.classList.add('sheet-open');
    document.getElementById('sheet-close')?.removeAttribute('hidden');
    document.getElementById('stock_name')?.focus();
}

function closeSheet() {
    document.body.classList.remove('sheet-open');
    document.getElementById('sheet-close')?.setAttribute('hidden', '');
    document.getElementById('add-fab')?.focus();
}

export function initTransactionForm() {
    const form = document.getElementById('transaction-form');
    if (!form) return;

    const dateInput = document.getElementById('date');
    if (dateInput && window.flatpickr) flatpickr(dateInput, csDatePickerOptions(new Date()));

    document.getElementById('type-buy')?.addEventListener('click', () => setType('buy'));
    document.getElementById('type-sell')?.addEventListener('click', () => setType('sell'));
    setType('buy');

    document.getElementById('add-fab')?.addEventListener('click', openSheet);
    document.getElementById('sheet-close')?.addEventListener('click', closeSheet);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && document.body.classList.contains('sheet-open')) closeSheet();
    });

    form.addEventListener('submit', async event => {
        event.preventDefault();
        setLoading('submit-btn', true);

        try {
            const { valid, isoDate } = validateForm();
            if (!valid) return;

            const payload = {
                type: currentType(),
                stock_name: stockNameInput().value.trim(),
                date: isoDate,
                price: parseFloat(document.getElementById('price').value),
                quantity: parseInt(document.getElementById('quantity').value, 10),
                fees: parseFloat(document.getElementById('fees').value) || 0,
            };

            const response = await csrfFetch('/api/transaction', {
                method: 'POST',
                body: JSON.stringify(payload),
            });
            const data = await readJson(response);
            if (!response.ok) {
                throw new Error(extractErrorMessage(data, 'Transakci se nepodařilo přidat'));
            }

            showMessage('Transakce přidána', 'success');
            form.reset();
            clearFieldErrors();
            if (dateInput?._flatpickr) dateInput._flatpickr.setDate(new Date(), false);
            if (document.body.classList.contains('sheet-open')) closeSheet();

            // Reload first so holdings are fresh before the sell-select
            // repopulates; otherwise setType would also fire its own fetch.
            await reloadDataAfterMutation();
            setType(payload.type);
        } catch (error) {
            handleError(error, 'Transakci se nepodařilo přidat: ' + error.message);
        } finally {
            setLoading('submit-btn', false);
        }
    });
}

export function initUpdatePricesButton() {
    const btn = document.getElementById('update-prices-btn');
    if (!btn) return;

    btn.addEventListener('click', async () => {
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.textContent = 'Aktualizuji…';

        try {
            const response = await csrfFetch('/api/update-prices', { method: 'POST' });
            const data = await readJson(response);
            if (!response.ok) {
                throw new Error(extractErrorMessage(data, 'Aktualizace se nezdařila'));
            }
            showMessage(
                data.failed
                    ? `Ceny aktualizovány: ${data.updated} načteno, ${data.failed} se nepodařilo`
                    : `Ceny aktualizovány: ${data.updated} načteno`,
                data.failed ? 'error' : 'success'
            );
            await Promise.all([loadHoldings(), loadTaxInfo()]);
        } catch (error) {
            handleError(error, 'Ceny se nepodařilo aktualizovat: ' + error.message);
        } finally {
            btn.disabled = false;
            btn.innerHTML = original;
        }
    });
}
