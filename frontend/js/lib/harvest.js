// Harvest freshness (pure): a harvester that ran recently has little new to find, so its
// Harvest button is off (greyed, no hover, no click) for a while.

/** How long after a successful harvest the button stays off. */
export const HARVEST_FRESH_MS = 60 * 60 * 1000;

/**
 * Minutes since the source's last successful harvest, if that was within HARVEST_FRESH_MS;
 * otherwise null.
 * @param {SourceStatus | undefined} source @param {number} now
 * @returns {number | null}
 */
export function freshMinutes(source, now) {
    if (!source?.last_sync_time) return null;
    const at = new Date(source.last_sync_time).getTime();
    if (Number.isNaN(at) || now - at >= HARVEST_FRESH_MS) return null;
    return Math.max(0, Math.floor((now - at) / 60000));
}

/** Why Harvest is off (shown on the harvester, not the button). @param {number} minutes */
export function freshTitle(minutes) {
    const ago = minutes < 1 ? 'just now' : `${minutes} min ago`;
    const left = Math.max(1, Math.ceil(HARVEST_FRESH_MS / 60000 - minutes));
    return `Harvested ${ago}: Harvest is off for ${left} more min`;
}
