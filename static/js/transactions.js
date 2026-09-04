// Transaction CRUD, per-stock history expansion, and ticker rename.
//
// DOM events use delegation via data-action attributes on rendered rows, so
// no inline onclick is required anywhere.

import {
    formatCurrency, formatIsoDateCs, parseCsDateToIso,
    transactionTotalValue, csDatePickerOptions, escapeHtml,
} from './format.js';
import { csrfFetch, readJson, extractErrorMessage } from './api.js';
import { showMessage, handleError } from './ui.js';
import { loadHoldings } from './holdings.js';
import { loadTaxInfo, loadYearlyProfitLoss } from './tax.js';

function reloadDataAfterMutation() {
    return Promise.all([
        loadHoldings(),
        loadTaxInfo(),
        loadYearlyProfitLoss(),
    ]);
}

// --- Stock history -----------------------------------------------------------

function renderHistoryRow(tx) {
    const typeText = tx.type === 'buy' ? 'Nákup' : 'Prodej';
    const fees = tx.fees || 0;
    return `
        <div class="tx" data-tx-id="${tx.id}" data-tx-stock="${escapeHtml(tx.stock_name)}">
            <span class="dim">${formatIsoDateCs(tx.date)}</span>
            <span class="tag">${typeText}</span>
            <span>${formatCurrency(tx.price)}</span>
            <span class="dim">${tx.quantity} ks</span>
            <span>${formatCurrency(transactionTotalValue(tx))}</span>
            <span class="tx-actions">
                <button type="button" class="btn-edit" data-action="edit-tx" title="Upravit" aria-label="Upravit transakci">✎</button>
                <button type="button" class="btn-delete" data-action="delete-tx" title="Smazat" aria-label="Smazat transakci">🗑</button>
            </span>
        </div>`;
}

async function loadStockHistory(stockName, contentEl) {
    if (!contentEl) return;
    contentEl.classList.add('loading');
    try {
        const response = await fetch(`/api/transactions?stock=${encodeURIComponent(stockName)}`);
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Nepodařilo se načíst historii'));
        }

        const transactions = data.transactions || [];
        contentEl.classList.remove('loading');
        contentEl.dataset.loaded = '1';

        if (transactions.length === 0) {
            contentEl.innerHTML = '<p class="dim">Žádné transakce pro tuto akcii.</p>';
            return;
        }

        contentEl.innerHTML = `<div class="txs">${transactions.map(renderHistoryRow).join('')}</div>`;
    } catch (error) {
        console.error('Error loading stock history:', error);
        contentEl.classList.remove('loading');
        contentEl.innerHTML = '<p class="error-text">Historii se nepodařilo načíst. Zkuste to znovu.</p>';
    }
}

function toggleHistory(button) {
    const drawer = document.getElementById(button.dataset.historyId);
    if (!drawer) return;

    const lot = button.closest('.lot');
    const open = button.getAttribute('aria-expanded') === 'true';

    button.setAttribute('aria-expanded', String(!open));
    drawer.style.gridTemplateRows = open ? '0fr' : '1fr';
    if (lot) lot.classList.toggle('open', !open);

    const contentEl = drawer.querySelector('.history-content');
    if (!open && contentEl && !contentEl.dataset.loaded) {
        loadStockHistory(button.dataset.stock, contentEl);
    }
}

// --- Ticker rename -------------------------------------------------------------

async function postRename(oldName, newName, confirmMerge) {
    const response = await csrfFetch('/api/stock/rename', {
        method: 'POST',
        body: JSON.stringify({ old_name: oldName, new_name: newName, confirm_merge: confirmMerge }),
    });
    return { response, data: await readJson(response) };
}

async function renameStock(oldName) {
    const input = prompt(`Přejmenovat ticker "${oldName}" na:`, oldName);
    if (input === null) return;

    const newName = input.trim();
    if (!newName || newName === oldName) return;

    try {
        let { response, data } = await postRename(oldName, newName, false);

        // The server rejects a merge it was not told to expect: fusing two lot
        // streams cannot be undone by renaming back.
        if (response.status === 409 && data?.error?.code === 'MERGE_REQUIRES_CONFIRMATION') {
            const proceed = confirm(
                `${extractErrorMessage(data, '')}\n\n` +
                'Sloučení je nevratné - zpětné přejmenování pozice znovu nerozdělí. Pokračovat?'
            );
            if (!proceed) return;
            ({ response, data } = await postRename(oldName, newName, true));
        }

        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Přejmenování se nezdařilo'));
        }

        showMessage(
            data.merged
                ? `${oldName} sloučeno do ${data.new_name} (${data.renamed} transakcí). Aktualizujte ceny.`
                : `${oldName} přejmenováno na ${data.new_name} (${data.renamed} transakcí). Aktualizujte ceny.`,
            'success'
        );
        await reloadDataAfterMutation();
    } catch (error) {
        handleError(error, 'Ticker se nepodařilo přejmenovat: ' + error.message);
    }
}

// --- Edit / save / delete --------------------------------------------------------

function convertRowToEditMode(row, transaction) {
    row.classList.add('edit-mode');
    const displayDate = formatIsoDateCs(transaction.date);

    row.innerHTML = `
        <span><input type="text" class="edit-date" value="${displayDate}" aria-label="Datum"></span>
        <span class="tag">${transaction.type === 'buy' ? 'Nákup' : 'Prodej'}</span>
        <span><input type="number" class="edit-price" value="${transaction.price}" step="0.01" min="0" aria-label="Cena v Kč"></span>
        <span><input type="number" class="edit-quantity" value="${transaction.quantity}" min="1" aria-label="Množství"></span>
        <span class="tx-total">—</span>
        <span class="tx-actions">
            <button type="button" class="btn-save" data-action="save-tx" title="Uložit" aria-label="Uložit">✓</button>
            <button type="button" class="btn-cancel" data-action="cancel-tx" title="Zrušit" aria-label="Zrušit">✕</button>
        </span>
    `;

    const dateInput = row.querySelector('.edit-date');
    if (dateInput && window.flatpickr) flatpickr(dateInput, csDatePickerOptions(transaction.date));

    const updateTotal = () => {
        const price = parseFloat(row.querySelector('.edit-price').value) || 0;
        const quantity = parseInt(row.querySelector('.edit-quantity').value, 10) || 0;
        const total = transactionTotalValue({ type: transaction.type, price, quantity, fees: transaction.fees || 0 });
        row.querySelector('.tx-total').textContent = formatCurrency(total);
    };
    row.querySelectorAll('.edit-price, .edit-quantity').forEach(el => el.addEventListener('input', updateTotal));
    updateTotal();
}

async function startEdit(row) {
    if (row.classList.contains('edit-mode')) return;
    const txId = parseInt(row.dataset.txId, 10);
    const stockName = row.dataset.txStock;

    try {
        const response = await fetch(`/api/transactions?stock=${encodeURIComponent(stockName)}`);
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Nepodařilo se načíst transakci'));
        }
        const transaction = (data.transactions || []).find(tx => tx.id === txId);
        if (!transaction) {
            showMessage('Transakce nenalezena', 'error');
            return;
        }
        row.dataset.txFees = transaction.fees || 0;
        convertRowToEditMode(row, transaction);
    } catch (error) {
        handleError(error, 'Transakci se nepodařilo otevřít: ' + error.message);
    }
}

async function saveEdit(row) {
    const txId = parseInt(row.dataset.txId, 10);
    try {
        const iso = parseCsDateToIso(row.querySelector('.edit-date').value);
        if (!iso) {
            showMessage('Zadejte datum ve formátu DD.MM.RRRR.', 'error');
            return;
        }

        const price = parseFloat(row.querySelector('.edit-price').value);
        const quantity = parseInt(row.querySelector('.edit-quantity').value, 10);
        const fees = parseFloat(row.dataset.txFees) || 0;

        if (!price || price <= 0 || !quantity || quantity <= 0) {
            showMessage('Cena i množství musí být větší než 0.', 'error');
            return;
        }

        const response = await csrfFetch(`/api/transaction/${txId}`, {
            method: 'PUT',
            body: JSON.stringify({ date: iso, price, quantity, fees }),
        });
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Uložení se nezdařilo'));
        }

        showMessage('Transakce uložena', 'success');
        await reloadDataAfterMutation();
    } catch (error) {
        handleError(error, 'Transakci se nepodařilo uložit: ' + error.message);
    }
}

async function deleteRow(row) {
    if (!confirm('Opravdu smazat tuto transakci? Akce je nevratná.')) return;
    const txId = parseInt(row.dataset.txId, 10);
    try {
        const response = await csrfFetch(`/api/transaction/${txId}`, { method: 'DELETE' });
        const data = await readJson(response);
        if (!response.ok) {
            throw new Error(extractErrorMessage(data, 'Smazání se nezdařilo'));
        }
        showMessage('Transakce smazána', 'success');
        await reloadDataAfterMutation();
    } catch (error) {
        handleError(error, 'Transakci se nepodařilo smazat: ' + error.message);
    }
}

async function cancelEdit(row) {
    const contentEl = document.querySelector(
        `.history-content[data-history-for="${row.dataset.txStock}"]`
    );
    if (contentEl) await loadStockHistory(row.dataset.txStock, contentEl);
}

// --- Event delegation -------------------------------------------------------------

export function initTransactionInteractions() {
    document.addEventListener('click', async event => {
        const actionEl = event.target.closest('[data-action]');
        if (!actionEl) return;

        const action = actionEl.dataset.action;

        if (action === 'rename-stock') {
            event.stopPropagation();
            await renameStock(actionEl.dataset.stock);
            return;
        }
        if (action === 'toggle-history') {
            toggleHistory(actionEl);
            return;
        }

        const row = actionEl.closest('[data-tx-id]');
        if (!row) return;

        switch (action) {
            case 'edit-tx': await startEdit(row); break;
            case 'save-tx': await saveEdit(row); break;
            case 'cancel-tx': await cancelEdit(row); break;
            case 'delete-tx': await deleteRow(row); break;
            default: break;
        }
    });

    // The rename affordance sits inside the expand button, so it needs its own
    // keyboard path - Enter on it must not also toggle the drawer.
    document.addEventListener('keydown', async event => {
        const el = event.target.closest('[data-action="rename-stock"]');
        if (!el || (event.key !== 'Enter' && event.key !== ' ')) return;
        event.preventDefault();
        event.stopPropagation();
        await renameStock(el.dataset.stock);
    });
}

export { reloadDataAfterMutation };
