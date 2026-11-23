import { useEffect, useRef } from 'react';
import { html } from '../html.js';

/**
 * A live 3D view of an adventure's model, or the default card with its cover
 * (lib/cabinet/modelViews.js). Drag turns it when `orbit` is set.
 * @param {{ spec: ReturnType<typeof import('../lib/items.js').modelSpec>, distance?: number, orbit?: boolean, label: string }} props
 */
export function ModelView({ spec, distance, orbit, label }) {
    const ref = useRef(/** @type {HTMLCanvasElement | null} */ (null));
    const viewRef = useRef(/** @type {any} */ (null));
    const latest = useRef(spec);
    latest.current = spec;

    useEffect(() => {
        let disposed = false;
        import('../lib/cabinet/modelViews.js')
            .then(({ addView }) => { if (!disposed && ref.current) viewRef.current = addView(ref.current, latest.current, { distance, orbit }); })
            .catch((err) => console.error('[model view] failed to start', err));
        return () => { disposed = true; viewRef.current?.dispose(); viewRef.current = null; };
    }, []);
    useEffect(() => { viewRef.current?.update(spec); }, [spec]);

    return html`<canvas ref=${ref} className=${`model-view ${orbit ? 'orbit' : ''}`} role="img" aria-label=${label}></canvas>`;
}
