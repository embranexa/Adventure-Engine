// Dock resizing helpers. While a splitter is dragged, <body> carries `is-resizing`:
// styles.css drops the expensive glass blur and pauses background animation, and heavy
// views (the map, the Nexus) wait until the drag pauses before resizing their canvases.

export const RESIZING_CLASS = 'is-resizing';
const SETTLE_MS = 140;

export function isResizing() {
    return document.body.classList.contains(RESIZING_CLASS);
}

/**
 * The window a node is shown in: the main window, or a popped-out panel's own window.
 * Scenes take their animation frames, pixel ratio and resize observer from it, so a
 * popped-out scene keeps animating while the main window is hidden.
 * @param {Node | null | undefined} node
 * @returns {Window & typeof globalThis}
 */
export function viewOf(node) {
    return /** @type {any} */ (node?.ownerDocument?.defaultView ?? window);
}

/**
 * Wrap a resize handler for a ResizeObserver: runs at most once per frame normally,
 * and only after the size has settled for SETTLE_MS while a splitter is being dragged.
 * @param {() => void} fn
 * @param {Window} [view]  the window whose animation frames to use
 * @returns {() => void}
 */
export function deferredResize(fn, view = window) {
    let raf = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    return () => {
        view.cancelAnimationFrame(raf);
        clearTimeout(timer);
        if (isResizing()) timer = setTimeout(fn, SETTLE_MS);
        else raf = view.requestAnimationFrame(fn);
    };
}
