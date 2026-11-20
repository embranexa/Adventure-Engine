import { memo, useRef, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PanelGroup } from './PanelGroup.js';
import { RESIZING_CLASS } from '../lib/resizing.js';

/** @param {{ node: LayoutNode | null }} props */
function DockNodeImpl({ node }) {
    const resizeSplit = useWorkspaceStore((s) => s.resizeSplit);
    const commitResize = useWorkspaceStore((s) => s.commitResize);
    const containerRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const [dragging, setDragging] = useState(false);

    if (!node) return null;

    if (node.type === 'leaf') {
        return html`<${PanelGroup} node=${node} />`;
    }

    const isHorizontal = node.direction === 'horizontal';

    /** @param {MouseEvent} e */
    const startResize = (e) => {
        e.preventDefault();
        if (!containerRef.current) return;
        setDragging(true);
        document.body.classList.add(RESIZING_CLASS); // cheap rendering while dragging (see lib/resizing.js)

        // The split's own box doesn't move during its drag: measure once, not per event.
        const rect = containerRef.current.getBoundingClientRect();
        let raf = 0;
        let latest = 0;

        // Coalesce mouse events: at most one layout update per animation frame.
        const onMouseMove = (/** @type {MouseEvent} */ moveEvent) => {
            latest = isHorizontal
                ? ((moveEvent.clientX - rect.left) / rect.width) * 100
                : ((moveEvent.clientY - rect.top) / rect.height) * 100;
            if (!raf) raf = requestAnimationFrame(() => { raf = 0; resizeSplit(node.id, latest); });
        };

        const onMouseUp = () => {
            cancelAnimationFrame(raf);
            if (latest) resizeSplit(node.id, latest);
            setDragging(false);
            document.body.classList.remove(RESIZING_CLASS);
            commitResize();
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };

        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
    };

    return html`
        <div ref=${containerRef} className=${`dock-split ${node.direction}`}>
            <div style=${{
                display: 'flex',
                flexBasis: `${node.ratio}%`,
                flexGrow: 0,
                flexShrink: 0,
                minWidth: 0,
                minHeight: 0,
                overflow: 'visible' // corner ornaments and frame shadows extend past the box
            }}>
                <${DockNode} node=${node.first} />
            </div>

            <div
                className=${`dock-resizer ${node.direction} ${dragging ? 'active' : ''}`}
                onMouseDown=${startResize}
            />

            <div style=${{
                display: 'flex',
                flexBasis: `${100 - node.ratio}%`,
                flexGrow: 1,
                flexShrink: 1,
                minWidth: 0,
                minHeight: 0,
                overflow: 'visible' // corner ornaments and frame shadows extend past the box
            }}>
                <${DockNode} node=${node.second} />
            </div>
        </div>
    `;
}

// Memoized: the store keeps untouched subtrees referentially equal, so a
// resize or tab switch only re-renders the branch that actually changed.
export const DockNode = memo(DockNodeImpl);
