import { useState, useRef } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PanelContent } from './PanelContent.js';

export function PanelGroup({ node }) {
    const {
        panels,
        draggingPanelId,
        setDraggingPanel,
        selectTab,
        dockPanel,
        closePanel
    } = useWorkspaceStore();

    const [hoverZone, setHoverZone] = useState(null);
    const groupRef = useRef(null);

    const computeDropZone = (e) => {
        if (!groupRef.current) return 'center';
        const rect = groupRef.current.getBoundingClientRect();
        const relX = (e.clientX - rect.left) / rect.width;
        const relY = (e.clientY - rect.top) / rect.height;

        if (relY < 0.25) return 'top';
        if (relY > 0.75) return 'bottom';
        if (relX < 0.25) return 'left';
        if (relX > 0.75) return 'right';
        return 'center';
    };

    const handleDragOver = (e) => {
        e.preventDefault();
        if (!draggingPanelId) return;
        setHoverZone(computeDropZone(e));
    };

    const handleDrop = (e) => {
        e.preventDefault();
        const panelId = e.dataTransfer.getData('text/plain') || draggingPanelId;
        const zone = computeDropZone(e);
        setHoverZone(null);
        setDraggingPanel(null);
        if (panelId) dockPanel(panelId, node.id, zone);
    };

    const activeTab = node.tabs.includes(node.activeTab) ? node.activeTab : node.tabs[0];

    return html`
        <div
            ref=${groupRef}
            className="panel-group"
            onDragOver=${handleDragOver}
            onDragLeave=${() => setHoverZone(null)}
            onDrop=${handleDrop}
        >
            <div className="tab-bar">
                ${node.tabs.map((tabId) => {
                    const meta = panels[tabId] || { title: tabId };
                    const isActive = tabId === activeTab;
                    return html`
                        <div
                            key=${tabId}
                            className=${`tab ${isActive ? 'active' : ''}`}
                            draggable="true"
                            onDragStart=${(e) => {
                                e.dataTransfer.setData('text/plain', tabId);
                                setDraggingPanel(tabId);
                            }}
                            onDragEnd=${() => {
                                setHoverZone(null);
                                setDraggingPanel(null);
                            }}
                            onClick=${() => selectTab(node.id, tabId)}
                        >
                            <span>${meta.title}</span>
                            <span
                                className="tab-close"
                                title="Banish / Undock Conduit"
                                onClick=${(e) => {
                                    e.stopPropagation();
                                    closePanel(tabId);
                                }}
                            >✕</span>
                        </div>
                    `;
                })}
            </div>

            ${activeTab && html`<${PanelContent} panelId=${activeTab} />`}

            ${hoverZone && html`
                <div className="drop-overlay">
                    <div className=${`drop-zone-preview ${hoverZone}`}></div>
                </div>
            `}
        </div>
    `;
}
