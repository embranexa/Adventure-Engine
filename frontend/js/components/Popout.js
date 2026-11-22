// Pop-out windows: any panel can leave the dock for a browser window of its own.
// See resources/signal chain digital twin/BUILD_PLAN.md, phase 8.
//
// The window gets the main page's stylesheets and its own small React root, which reads
// the same store, so selection, filters, lens and the live feed stay in sync both ways.
// The panel stays in the saved layout (hidden from the main dock: `dockedTree` in
// store.js), so closing the window, or reloading the page, puts it back where it was.
//
//   popOut(panelId, rect)  open (or focus) its window; call it from a click (browsers
//                          only allow window.open in response to one)
//   mountPopout(id, win)   fill a window you opened yourself (tests use an iframe's window)

import { createRoot } from 'react-dom/client';
import { html } from '../html.js';
import { popoutHooks, useWorkspaceStore } from '../store.js';
import { addWindow, removeWindow } from '../lib/windows.js';
import { PanelGroup } from './PanelGroup.js';

/** @type {Map<PanelId, { win: Window, root: ReturnType<typeof createRoot> }>} */
const open = new Map();

/** A popped-out panel: its housing filling the window. @param {{ panelId: PanelId }} props */
function PopoutShell({ panelId }) {
    const leaf = { id: `popout:${panelId}`, type: /** @type {'leaf'} */ ('leaf'), tabs: [panelId], activeTab: panelId };
    return html`<div className="popout-shell"><${PanelGroup} node=${leaf} popout=${true} /></div>`;
}

/**
 * Copy one stylesheet (or preconnect) element into a window's head, with an absolute URL.
 * Resolves once a stylesheet has loaded (or failed).
 * @param {Element} node @param {Document} doc @returns {Promise<void>}
 */
function copyStyle(node, doc) {
    const copy = /** @type {HTMLElement} */ (doc.importNode(node, true));
    let loaded = Promise.resolve();
    if (node instanceof HTMLLinkElement) {
        const link = /** @type {HTMLLinkElement} */ (copy);
        link.href = node.href;
        if (node.rel === 'stylesheet') loaded = new Promise((done) => { link.onload = link.onerror = () => done(); });
    }
    doc.head.appendChild(copy);
    return loaded;
}

/** Longest wait for a window's stylesheets before showing the panel anyway. */
const STYLE_WAIT_MS = 3000;

const STYLE_SELECTOR = 'link[rel="stylesheet"], link[rel="preconnect"], style';

// Stylesheets added later (the map's CSS loads on demand) go to every open window too.
new MutationObserver((records) => {
    for (const r of records) {
        for (const node of r.addedNodes) {
            if (!(node instanceof Element) || !node.matches(STYLE_SELECTOR)) continue;
            for (const { win } of open.values()) copyStyle(node, win.document);
        }
    }
}).observe(document.head, { childList: true });

/**
 * Fill a window with a panel and keep it in sync with the store.
 * @param {PanelId} panelId @param {Window} win
 */
export function mountPopout(panelId, win) {
    const doc = win.document;
    const meta = useWorkspaceStore.getState().panels[panelId];
    // a fresh standards-mode document (a blank window has no doctype: quirks mode)
    doc.open();
    doc.write('<!doctype html><html lang="en"><head><meta charset="utf-8"></head><body></body></html>');
    doc.close();
    doc.title = `${meta?.name ?? panelId} · Adventure Engine`;
    const base = doc.createElement('base');
    base.href = `${location.origin}/`; // relative image and API URLs resolve against the app
    doc.head.appendChild(base);
    const styles = [...document.head.querySelectorAll(STYLE_SELECTOR)].map((node) => copyStyle(node, doc));
    doc.body.className = 'popout-body';
    const host = doc.createElement('div');
    host.className = 'popout-root';
    doc.body.appendChild(host);

    // Render once the styles are in: panels measure their boxes when they mount (the map
    // would size itself to an unstyled, zero-height box).
    const root = createRoot(host);
    const timeout = new Promise((done) => setTimeout(done, STYLE_WAIT_MS));
    Promise.race([Promise.all(styles), timeout]).then(() => {
        if (open.get(panelId)?.root === root) root.render(html`<${PopoutShell} panelId=${panelId} />`);
    });
    open.set(panelId, { win, root });
    addWindow(win);
    // its panel is in use while the window has focus
    win.addEventListener('focus', () => useWorkspaceStore.getState().focusGroup(`popout:${panelId}`));
    win.addEventListener('blur', () => useWorkspaceStore.getState().blurPopout(panelId));
    // the user closed the window (or it navigated away): back to the dock
    win.addEventListener('pagehide', () => gone(panelId, win));
}

/** Tear down a window's React root once the window is going. @param {PanelId} panelId @param {Window} win */
function gone(panelId, win) {
    const entry = open.get(panelId);
    if (!entry || entry.win !== win) return;
    open.delete(panelId);
    removeWindow(win);
    try { entry.root.unmount(); } catch { /* the document is already gone */ }
    useWorkspaceStore.getState().dockPopout(panelId);
}

/**
 * Open a panel in its own window, about where and how big it is now in the dock.
 * @param {PanelId} panelId @param {DOMRect} [rect]
 */
export function popOut(panelId, rect) {
    const existing = open.get(panelId);
    if (existing && !existing.win.closed) { existing.win.focus(); return; }
    const width = Math.max(420, Math.round(rect?.width ?? 900));
    const height = Math.max(320, Math.round(rect?.height ?? 640));
    const chromeY = window.outerHeight - window.innerHeight;
    const left = Math.round(window.screenX + (rect?.left ?? 80) + 24);
    const top = Math.round(window.screenY + chromeY + (rect?.top ?? 80) + 24);
    const win = window.open('', `adventure-engine:${panelId}`, `popup,width=${width},height=${height},left=${left},top=${top}`);
    if (!win) {
        console.warn('[popout] the browser blocked the window; allow pop-ups for this site');
        return;
    }
    mountPopout(panelId, win);
    useWorkspaceStore.getState().popOut(panelId);
}

// Docked again from elsewhere (the window's Dock button, closing the panel, a layout
// reset): close its window.
useWorkspaceStore.subscribe((state, prev) => {
    if (state.poppedOut === prev.poppedOut) return;
    for (const [panelId, { win, root }] of open) {
        if (state.poppedOut.includes(panelId)) continue;
        open.delete(panelId);
        removeWindow(win);
        try { root.unmount(); } catch { /* already gone */ }
        win.close();
    }
});

popoutHooks.focus = (panelId) => open.get(panelId)?.win.focus();

// The main page is going (reload, close): close the windows; their panels are still in
// the saved layout, so they come back docked.
window.addEventListener('pagehide', () => {
    for (const { win } of open.values()) win.close();
});
