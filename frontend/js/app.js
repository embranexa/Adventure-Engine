import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from './html.js';
import { useWorkspaceStore, collectMountedPanels } from './store.js';
import { DockNode } from './components/DockNode.js';

/** @param {FeedStatus} status */
function feedLabel(status) {
    switch (status.state) {
        case 'online': return '⚡ STREAM: ONLINE';
        case 'retrying': return `◌ STREAM: RETRY IN ${Math.round((status.retryInMs ?? 0) / 1000)}s`;
        case 'offline': return '◌ STREAM: OFFLINE';
        default: return '◌ STREAM: CONNECTING';
    }
}

function App() {
    // Per-field selectors: App re-renders only when one of these values changes
    const panels = useWorkspaceStore((s) => s.panels);
    const tree = useWorkspaceStore((s) => s.tree);
    const layoutStatus = useWorkspaceStore((s) => s.layoutStatus);
    const feedStatus = useWorkspaceStore((s) => s.feedStatus);
    const eventCount = useWorkspaceStore((s) => s.events.length);
    const initWorkspace = useWorkspaceStore((s) => s.initWorkspace);
    const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
    const reopenPanel = useWorkspaceStore((s) => s.reopenPanel);

    useEffect(() => {
        initWorkspace();
    }, []);

    const unmounted = useMemo(() => {
        const mounted = collectMountedPanels(tree);
        return Object.keys(panels).filter((id) => !mounted.has(id));
    }, [panels, tree]);

    return html`
        <div className="workspace-shell">
            <header className="topbar">
                <div className="topbar-left">
                    <span className="brand">❖ AETHER//NEXUS GRIMOIRE OS</span>
                    <span className="badge cyan">${feedLabel(feedStatus)}</span>
                    <span className="badge">EVENTS: ${eventCount}</span>
                    <span className="badge">RUNE-STATE: ${layoutStatus}</span>
                </div>

                <div className="topbar-right">
                    ${unmounted.length > 0 && html`
                        <select
                            className="btn"
                            onChange=${(e) => {
                                if (e.target.value) {
                                    reopenPanel(e.target.value);
                                    e.target.value = '';
                                }
                            }}
                        >
                            <option value="">+ Summon Conduit (${unmounted.length})</option>
                            ${unmounted.map((id) => html`
                                <option key=${id} value=${id}>${panels[id]?.title || id}</option>
                            `)}
                        </select>
                    `}
                    <button className="btn btn-primary" onClick=${resetWorkspace}>
                        ✦ Restore Conduit Sigil
                    </button>
                </div>
            </header>

            <main className="dock-root">
                ${tree
                    ? html`<${DockNode} node=${tree} />`
                    : html`
                        <div style=${{ margin: 'auto', color: '#a78bfa', fontFamily: 'Cinzel, serif' }}>
                            All arcane conduits banished. Use "+ Summon Conduit" or "Restore Conduit Sigil" above.
                        </div>
                    `
                }
            </main>
        </div>
    `;
}

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
