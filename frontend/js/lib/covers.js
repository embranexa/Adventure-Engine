// Cover images for canvases and WebGL: other origins go through the server's cache
// (/api/cover), since WebGL refuses images without CORS headers.

/** @param {string | null | undefined} link @returns {string | null} */
export function coverSrc(link) {
    if (typeof link !== 'string' || !link) return null;
    try {
        const u = new URL(link, window.location.href);
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
        return u.origin === window.location.origin ? u.href : `/api/cover?url=${encodeURIComponent(u.href)}`;
    } catch {
        return null;
    }
}
