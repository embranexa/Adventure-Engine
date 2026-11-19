// Load classic scripts and stylesheets on demand (once each), e.g. vendored
// browser builds that set a global, like three.js and MapLibre.

/** @type {Map<string, Promise<void>>} */
const loaded = new Map();

/** @param {string} key @param {() => HTMLElement} make */
function once(key, make) {
    let promise = loaded.get(key);
    if (!promise) {
        promise = new Promise((resolve, reject) => {
            const el = make();
            el.addEventListener('load', () => resolve());
            el.addEventListener('error', () => {
                loaded.delete(key); // allow a retry
                el.remove();
                reject(new Error(`Failed to load ${key}`));
            });
            document.head.appendChild(el);
        });
        loaded.set(key, promise);
    }
    return promise;
}

/** @param {string} src */
export function loadScript(src) {
    return once(src, () => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false; // run in insertion order when several load together
        return script;
    });
}

/** @param {string} href */
export function loadStylesheet(href) {
    return once(href, () => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = href;
        return link;
    });
}
