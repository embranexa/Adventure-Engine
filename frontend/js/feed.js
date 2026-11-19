// Owns the WebSocket to /api/ws. Nothing else touches the socket: code subscribes
// to message types with feed.on(type, handler). Message types: backend/services/hub.py.

const MAX_RETRY_DELAY_MS = 15000;

/** @type {Map<string, Set<(msg: any) => void>>} */
const subscribers = new Map();

/** @type {WebSocket | null} */
let socket = null;
let retries = 0;
let wanted = false;
/** @type {ReturnType<typeof setTimeout> | undefined} */
let retryTimer;
/** @type {(status: FeedStatus) => void} */
let reportStatus = () => {};

/**
 * Subscribe to one message type, or '*' for every message. Returns an unsubscribe function.
 * @template {keyof FeedMessages | '*'} K
 * @param {K} type
 * @param {(msg: K extends keyof FeedMessages ? FeedMessages[K] : FeedMessage) => void} handler
 * @returns {() => void}
 */
export function on(type, handler) {
    let set = subscribers.get(type);
    if (!set) subscribers.set(type, (set = new Set()));
    set.add(handler);
    return () => { subscribers.get(type)?.delete(handler); };
}

/**
 * Deliver a message to its subscribers. Exported so you can inject test messages
 * from the console, e.g. feed.dispatch({ type: 'events', events: [] }).
 * @param {FeedMessage} msg
 */
export function dispatch(msg) {
    for (const key of [msg.type, '*']) {
        subscribers.get(key)?.forEach((handler) => {
            try {
                handler(msg);
            } catch (err) {
                console.error(`[feed:${key}] handler failed`, err); // one bad handler can't break the others
            }
        });
    }
}

function socketUrl() {
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/api/ws`;
}

function open() {
    clearTimeout(retryTimer);
    reportStatus({ state: retries ? 'reconnecting' : 'connecting' });
    const s = (socket = new WebSocket(socketUrl()));

    s.onopen = () => {
        retries = 0;
        reportStatus({ state: 'online' });
    };
    s.onmessage = (event) => {
        let msg;
        try {
            msg = JSON.parse(event.data);
        } catch {
            return; // ignore non-JSON frames
        }
        if (msg && typeof msg.type === 'string') dispatch(msg);
    };
    s.onclose = () => {
        if (s !== socket) return; // a stale socket closing must not schedule a second reconnect
        socket = null;
        if (!wanted) {
            reportStatus({ state: 'offline' });
            return;
        }
        const delay = Math.min(1000 * 2 ** retries++, MAX_RETRY_DELAY_MS); // 1s, 2s, 4s ... 15s
        reportStatus({ state: 'retrying', retryInMs: delay });
        retryTimer = setTimeout(open, delay);
    };
}

/**
 * Connect (and keep reconnecting until stop()).
 * @param {(status: FeedStatus) => void} [onStatus] called on every connection state change
 */
export function start(onStatus) {
    if (onStatus) reportStatus = onStatus;
    wanted = true;
    if (!socket) open();
}

export function stop() {
    wanted = false;
    clearTimeout(retryTimer);
    if (socket) socket.close(); // onclose reports 'offline'
    else reportStatus({ state: 'offline' }); // stopped while waiting to retry
}
