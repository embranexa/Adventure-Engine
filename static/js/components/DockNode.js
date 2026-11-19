import { useRef, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PanelGroup } from './PanelGroup.js';

export function DockNode({ node }) {
    const resizeSplit = useWorkspaceStore((s) => s.resizeSplit);
    const commitResize = useWorkspaceStore((s) => s.commitResize);
    const containerRef = useRef(null);
    const [dragging, setDragging] = useState(false);

    if (!node) return null;

    if (node.type === 'leaf') {
        return html`<${PanelGroup} node=${node} />`;
    }

    const isHorizontal = node.direction === 'horizontal';

    const startResize = (e) => {
        e.preventDefault();
        setDragging(true);

        const onMouseMove = (moveEvent) => {
            if (!containerRef.current) return;
            const rect = containerRef.current.getBoundingClientRect();
            const ratio = isHorizontal
                ? ((moveEvent.clientX - rect.left) / rect.width) * 100
                : ((moveEvent.clientY - rect.top) / rect.height) * 100;
            resizeSplit(node.id, ratio);
        };

        const onMouseUp = () => {
            setDragging(false);
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
                overflow: 'hidden'
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
                overflow: 'hidden'
            }}>
                <${DockNode} node=${node.second} />
            </div>
        </div>
    `;
}
