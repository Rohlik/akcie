// A listbox that replaces the native select popup.
//
// The browser draws <option> lists with OS chrome - dim text on our dark
// ground and a system-blue highlight - and neither is reliably styleable.
// The native <select> stays in the DOM as the value holder so existing form
// code keeps reading `.value` and listening for `change`; this only replaces
// what the user sees and drives.

const OPEN_KEYS = ['Enter', ' ', 'ArrowDown', 'ArrowUp'];

export function enhanceSelect(select, options = {}) {
    if (!select) return null;
    if (select.dataset.enhanced) return select._combo;

    const { label = '' } = options;

    const wrap = document.createElement('div');
    wrap.className = 'combo-wrap';
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    select.classList.add('combo-native');
    select.tabIndex = -1;
    select.setAttribute('aria-hidden', 'true');

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'combo';
    button.setAttribute('role', 'combobox');
    button.setAttribute('aria-haspopup', 'listbox');
    button.setAttribute('aria-expanded', 'false');
    if (label) button.setAttribute('aria-label', label);

    const list = document.createElement('div');
    list.className = 'combo-list';
    list.setAttribute('role', 'listbox');
    list.hidden = true;
    list.id = `combo-list-${Math.random().toString(36).slice(2, 8)}`;
    button.setAttribute('aria-controls', list.id);

    wrap.append(button, list);

    let activeIndex = -1;

    const items = () => Array.from(list.querySelectorAll('[role="option"]'));

    function paintButton() {
        const chosen = select.options[select.selectedIndex];
        const empty = !chosen || chosen.value === '';
        button.textContent = chosen ? chosen.textContent : '';
        button.classList.toggle('is-placeholder', empty);
    }

    function build() {
        list.innerHTML = Array.from(select.options).map((opt, i) => `
            <div role="option" class="combo-opt${opt.value === '' ? ' is-placeholder' : ''}"
                 id="${list.id}-${i}" data-index="${i}"
                 aria-selected="${i === select.selectedIndex}">${escape(opt.textContent)}</div>
        `).join('');
        paintButton();
    }

    function setActive(index) {
        const all = items();
        if (!all.length) return;
        activeIndex = Math.max(0, Math.min(index, all.length - 1));
        all.forEach((el, i) => el.classList.toggle('is-active', i === activeIndex));
        button.setAttribute('aria-activedescendant', all[activeIndex].id);
        all[activeIndex].scrollIntoView({ block: 'nearest' });
    }

    function open() {
        if (!list.hidden) return;
        list.hidden = false;
        button.setAttribute('aria-expanded', 'true');
        setActive(select.selectedIndex >= 0 ? select.selectedIndex : 0);
        document.addEventListener('pointerdown', onOutside, true);
    }

    function close() {
        if (list.hidden) return;
        list.hidden = true;
        button.setAttribute('aria-expanded', 'false');
        button.removeAttribute('aria-activedescendant');
        document.removeEventListener('pointerdown', onOutside, true);
    }

    function onOutside(event) {
        if (!wrap.contains(event.target)) close();
    }

    function choose(index) {
        select.selectedIndex = index;
        items().forEach((el, i) => el.setAttribute('aria-selected', String(i === index)));
        paintButton();
        close();
        button.focus();
        // Existing listeners are bound to the native element, so the change has
        // to originate there.
        select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    button.addEventListener('click', () => (list.hidden ? open() : close()));

    button.addEventListener('keydown', event => {
        if (list.hidden) {
            if (OPEN_KEYS.includes(event.key)) { event.preventDefault(); open(); }
            return;
        }
        switch (event.key) {
            case 'ArrowDown': event.preventDefault(); setActive(activeIndex + 1); break;
            case 'ArrowUp': event.preventDefault(); setActive(activeIndex - 1); break;
            case 'Home': event.preventDefault(); setActive(0); break;
            case 'End': event.preventDefault(); setActive(items().length - 1); break;
            case 'Enter':
            case ' ': event.preventDefault(); choose(activeIndex); break;
            case 'Escape': event.preventDefault(); close(); break;
            case 'Tab': close(); break;
            default:
                // Type-ahead, the one native affordance worth keeping.
                if (event.key.length === 1) {
                    const needle = event.key.toLowerCase();
                    const from = items().findIndex((el, i) =>
                        i > activeIndex && el.textContent.trim().toLowerCase().startsWith(needle));
                    const wrapped = from === -1
                        ? items().findIndex(el => el.textContent.trim().toLowerCase().startsWith(needle))
                        : from;
                    if (wrapped !== -1) setActive(wrapped);
                }
        }
    });

    list.addEventListener('click', event => {
        const opt = event.target.closest('[role="option"]');
        if (opt) choose(Number(opt.dataset.index));
    });

    list.addEventListener('pointermove', event => {
        const opt = event.target.closest('[role="option"]');
        if (opt) setActive(Number(opt.dataset.index));
    });

    build();

    select.dataset.enhanced = '1';
    select._combo = { wrap, button, refresh: build, close };
    return select._combo;
}

function escape(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => (
        { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
    ));
}
