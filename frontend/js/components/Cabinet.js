import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../html.js';
import { LABEL_H, cabinetLayout } from '../lib/cabinet/layout.js';
import { deferredResize, viewOf } from '../lib/resizing.js';

/**
 * @typedef {object} CabinetModel
 * @property {string} type     which builder (lib/cabinet/models.js)
 * @property {string} id
 * @property {string} color    of its circles, beam and glow
 * @property {boolean} on      lit (finished) or dim
 * @property {number} [points] @property {number} [rings] @property {boolean} [lit]
 * @property {AdventureType} [kind] @property {string | null} [cover]   a vessel's
 * @property {number} [level] @property {number} [marks]   an amphora's
 * @property {Archetype} [idol]   an idol's
 * @property {string} [glyph]   a sigil's
 * @property {any} [parts]   a recipe's
 */
/** @typedef {{ id: string, label: string, sub: any, model: CabinetModel }} CabinetItem */
/** @typedef {{ shape: 'arch' | 'lancet' | 'octagon', sealColor: string, seed: string, points?: number, dim?: boolean }} CabinetStyle */

/**
 * A 3D cabinet: a scrolling grid of alcoves, each a button, with the cabinet drawn behind
 * them (lib/cabinet/cabinetScene.js). `children` follow the cabinet and scroll with it.
 * @param {{ groups: { title?: string | null, theme?: string, accent?: string, items: CabinetItem[] }[], look: CabinetStyle, selectedId: string | null,
 *           onSelect: (id: string) => void, label: string, options?: Parameters<typeof cabinetLayout>[2], children?: any }} props
 *   `look` is read once; `options` (the layout's) should be a constant; a group's
 *   `theme` is its housing's (lib/cabinet/themes.js), `accent` its title's colour
 */
export function Cabinet({ groups, look, selectedId, onSelect, label, options, children }) {
    const rootRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const scrollRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const sceneRef = useRef(/** @type {any} */ (null));
    const [width, setWidth] = useState(0);
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));

    const items = useMemo(() => groups.flatMap((g) => g.items), [groups]);
    const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
    const layout = useMemo(
        () => (width ? cabinetLayout(width, groups.map((g) => ({ title: g.title, theme: g.theme, ids: g.items.map((i) => i.id) })), options) : null),
        [width, groups, options],
    );

    // the scroller's width (without its scrollbar) sets the columns
    useEffect(() => {
        const el = scrollRef.current;
        if (!el) return;
        const view = viewOf(el);
        const measure = () => setWidth(el.clientWidth);
        const ro = new view.ResizeObserver(deferredResize(measure, view));
        ro.observe(el);
        measure();
        return () => ro.disconnect();
    }, []);

    useEffect(() => {
        let disposed = false;
        import('../lib/cabinet/cabinetScene.js')
            .then(({ CabinetScene }) => {
                if (disposed || !hostRef.current) return;
                sceneRef.current = new CabinetScene(hostRef.current, look);
                setStatus('ready');
            })
            .catch((err) => {
                console.error('[cabinet] failed to start', err);
                if (!disposed) setStatus('error');
            });
        return () => {
            disposed = true;
            sceneRef.current?.dispose();
            sceneRef.current = null;
        };
    }, []);

    useEffect(() => {
        if (!sceneRef.current || !layout) return;
        sceneRef.current.setScroll(scrollRef.current?.scrollTop ?? 0);
        sceneRef.current.update(layout, new Map(items.map((i) => [i.id, i.model])), { selectedId });
    }, [layout, items, selectedId, status]);

    const hover = (/** @type {string | null} */ id) => sceneRef.current?.setHover(id);

    return html`
        <div className="cab" ref=${rootRef}
            onPointerMove=${(/** @type {any} */ e) => {
                const r = rootRef.current?.getBoundingClientRect();
                if (r?.width) sceneRef.current?.setPointer((e.clientX - r.left) / r.width - 0.5);
            }}
            onPointerLeave=${() => sceneRef.current?.setPointer(0)}>
            <div className="cab-host" ref=${hostRef}></div>
            <div className="cab-scroll" ref=${scrollRef} onScroll=${(/** @type {any} */ e) => sceneRef.current?.setScroll(e.currentTarget.scrollTop)}>
                <div className="cab-grid" role="group" aria-label=${label} style=${{ height: layout?.height ?? 0 }}>
                    ${layout?.groups.map((g, i) => g.title && html`
                        <div key=${`t${i}`} className="cab-title" style=${{ top: g.y - 34, left: layout.x0, width: layout.width - 2 * layout.x0, ...(groups[i]?.accent ? { color: groups[i].accent, top: g.y - 52 } : {}) }}>${g.title}</div>
                    `)}
                    ${layout?.cells.map((c) => {
                        const item = c.id != null ? byId.get(c.id) : null;
                        if (!item) return null;
                        return html`
                            <button key=${item.id} className=${`cab-cell ${item.id === selectedId ? 'sel' : ''} ${item.model.on ? '' : 'dim'}`}
                                style=${{ left: c.x, top: c.y, width: c.w, height: c.h, '--c': item.model.color, '--label-h': `${LABEL_H}px` }}
                                aria-pressed=${item.id === selectedId} title=${item.label}
                                onClick=${() => onSelect(item.id)}
                                onPointerEnter=${() => hover(item.id)} onPointerLeave=${() => hover(null)}
                                onFocus=${() => hover(item.id)} onBlur=${() => hover(null)}>
                                <span className="cab-label"><b>${item.label}</b><small>${item.sub}</small></span>
                            </button>
                        `;
                    })}
                </div>
                ${children}
            </div>
            ${status !== 'ready' && html`<div className="map-status">${status === 'loading' ? 'Opening the cabinet…' : 'The cabinet failed to load (see console)'}</div>`}
        </div>
    `;
}
