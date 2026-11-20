import { memo, useState, useRef } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { pendingChanges } from '../filters.js';
import { PanelContent } from './PanelContent.js';
import { Corners, Icon, PanelTitle } from './PanelTitle.js';

const STEEL = '#cfd3da';

/**
 * Hover accent and status light for a panel, by kind.
 * @param {PanelKind | undefined} kind
 * @returns {{ acc: string, light: { cls: string, label: string } | null }}
 */
function usePanelChrome(kind) {
    const selectedColor = useWorkspaceStore((s) => (s.selectedItemId ? s.itemsById[s.selectedItemId]?.color : null));
    const pending = useWorkspaceStore((s) => pendingChanges(s.draftFilters, s.filters));
    const shown = useWorkspaceStore((s) => s.visibleItems.length);
    switch (kind) {
        case 'node':
            return { acc: selectedColor ?? STEEL, light: null };
        case 'classifier':
            return {
                acc: '#1fc2c9',
                light: pending ? { cls: 'pending', label: `${pending} pending` } : { cls: '', label: 'in sync' },
            };
        case 'map':
        case 'calendar':
            return { acc: STEEL, light: { cls: 'on', label: `${shown} shown` } };
        default:
            return { acc: STEEL, light: null };
    }
}

/**
 * A module housing: steel pipe frame with ornate corners, glass interior, and a
 * nameplate (title, status, close), plus a tab strip when several panels share the
 * housing. Drag the nameplate or a tab to re-dock.
 * @param {{ node: LeafNode }} props
 */
function PanelGroupImpl({ node }) {
    const panels = useWorkspaceStore((s) => s.panels);
    const mode = useWorkspaceStore((s) => s.mode);
    const draggingPanelId = useWorkspaceStore((s) => s.draggingPanelId);
    const setDraggingPanel = useWorkspaceStore((s) => s.setDraggingPanel);
    const selectTab = useWorkspaceStore((s) => s.selectTab);
    const dockPanel = useWorkspaceStore((s) => s.dockPanel);
    const closePanel = useWorkspaceStore((s) => s.closePanel);

    const [hoverZone, setHoverZone] = useState(/** @type {DropZone | null} */ (null));
    const groupRef = useRef(/** @type {HTMLDivElement | null} */ (null));

    const activeTab = node.tabs.includes(node.activeTab) ? node.activeTab : node.tabs[0];
    const meta = panels[activeTab];
    const { acc, light } = usePanelChrome(meta?.kind);

    /** @param {DragEvent} e */
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

    /** @param {DragEvent} e @param {PanelId} id */
    const startDrag = (e, id) => {
        e.dataTransfer?.setData('text/plain', id);
        setDraggingPanel(id);
    };
    const endDrag = () => {
        setHoverZone(null);
        setDraggingPanel(null);
    };

    /** @param {DragEvent} e */
    const handleDragOver = (e) => {
        e.preventDefault();
        if (!draggingPanelId) return;
        setHoverZone(computeDropZone(e));
    };

    /** @param {DragEvent} e */
    const handleDrop = (e) => {
        e.preventDefault();
        const panelId = e.dataTransfer?.getData('text/plain') || draggingPanelId;
        const zone = computeDropZone(e);
        endDrag();
        if (panelId) dockPanel(panelId, node.id, zone);
    };

    // In Discovery the generic input word becomes "omen"
    const input = meta && meta.flow[0] === 'matter' && mode === 'discovery' ? 'omen' : undefined;

    return html`
        <div
            ref=${groupRef}
            className="module"
            style=${{ '--acc': acc }}
            onDragOver=${handleDragOver}
            onDragLeave=${() => setHoverZone(null)}
            onDrop=${handleDrop}
        >
            <${Corners} />
            <div className="glass">
                <div className="bloom"></div>
                <div
                    className="plate"
                    draggable="true"
                    title="Drag to re-dock"
                    onDragStart=${(/** @type {DragEvent} */ e) => activeTab && startDrag(e, activeTab)}
                    onDragEnd=${endDrag}
                >
                    ${meta
                        ? html`<${PanelTitle} meta=${meta} input=${input} />`
                        : html`<div className="ptitle"><span className="ptitle-name">${activeTab}</span></div>`}
                    <div className="plate-end">
                        ${light && html`<span className=${`light ${light.cls}`}><i></i>${light.label}</span>`}
                        ${activeTab && html`
                            <button className="pclose" title="Close panel" aria-label="Close panel" onClick=${() => closePanel(activeTab)}>✕</button>
                        `}
                    </div>
                </div>
                ${node.tabs.length > 1 && html`
                    <div className="tabstrip" role="tablist" aria-label="Stacked panels">
                        ${node.tabs.map((tabId) => {
                            const tab = panels[tabId];
                            const active = tabId === activeTab;
                            return html`
                                <div
                                    key=${tabId}
                                    role="tab"
                                    tabIndex="0"
                                    aria-selected=${active}
                                    className=${`tab ${active ? 'active' : ''}`}
                                    title=${tab ? `${tab.name} · ${tab.question} — drag to re-dock` : tabId}
                                    draggable="true"
                                    onDragStart=${(/** @type {DragEvent} */ e) => startDrag(e, tabId)}
                                    onDragEnd=${endDrag}
                                    onClick=${() => selectTab(node.id, tabId)}
                                    onKeyDown=${(/** @type {KeyboardEvent} */ e) => (e.key === 'Enter' || e.key === ' ') && selectTab(node.id, tabId)}
                                >
                                    ${tab && html`<${Icon} name=${tab.icon} size=${12} />`}
                                    <span>${tab?.name ?? tabId}</span>
                                    <button
                                        className="tab-close"
                                        title="Close panel"
                                        aria-label=${`Close ${tab?.name ?? tabId}`}
                                        onClick=${(/** @type {MouseEvent} */ e) => { e.stopPropagation(); closePanel(tabId); }}
                                    >✕</button>
                                </div>
                            `;
                        })}
                    </div>
                `}
                ${activeTab && html`<${PanelContent} panelId=${activeTab} />`}
            </div>

            ${hoverZone && html`
                <div className="drop-overlay">
                    <div className=${`drop-zone-preview ${hoverZone}`}></div>
                </div>
            `}
        </div>
    `;
}

export const PanelGroup = memo(PanelGroupImpl);
