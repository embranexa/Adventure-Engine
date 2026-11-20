// Dock resizing helpers. While a splitter is dragged, <body> carries `is-resizing`:
// styles.css drops the expensive glass blur and pauses background animation, and heavy
// views (the map, the Nexus) wait until the drag pauses before resizing their canvases.

export const RESIZING_CLASS = 'is-resizing';
const SETTLE_MS = 140;

export function isResizing() {
    return document.body.classList.contains(RESIZING_CLASS);
}

/**
 * Wrap a resize handler for a ResizeObserver: runs at most once per frame normally,
 * and only after the size has settled for SETTLE_MS while a splitter is being dragged.
 * @param {() => void} fn
 * @returns {() => void}
 */
export function deferredResize(fn) {
    let raf = 0;
    /** @type {ReturnType<typeof setTimeout> | undefined} */
    let timer;
    return () => {
        cancelAnimationFrame(raf);
        clearTimeout(timer);
        if (isResizing()) timer = setTimeout(fn, SETTLE_MS);
        else raf = requestAnimationFrame(fn);
    };
}
