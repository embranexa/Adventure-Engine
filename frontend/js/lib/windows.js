// The app's windows: the main one plus any popped-out panel windows (pure registry, no
// React). Panels use `focusedWindow()` for things that belong to the window the user is
// working in: confirm dialogs, and window-wide listeners (a drag's pointerup, Esc).

/** @type {Set<Window>} */
const extra = new Set();

/** @param {Window} win */
export function addWindow(win) { extra.add(win); }

/** @param {Window} win */
export function removeWindow(win) { extra.delete(win); }

/** The window with focus: a popped-out panel's window, else the main one. */
export function focusedWindow() {
    for (const win of extra) {
        try {
            if (!win.closed && win.document.hasFocus()) return /** @type {Window & typeof globalThis} */ (win);
        } catch { /* closing */ }
    }
    return window;
}

/** `confirm` in the window the user is working in. @param {string} message */
export function confirmHere(message) {
    return focusedWindow().confirm(message);
}
