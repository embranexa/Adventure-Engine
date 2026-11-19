import { useEffect } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from './html.js';
import { useWorkspaceStore } from './store.js';
import { DockNode } from './components/DockNode.js';

function App() {
    const {
        panels,
        tree,
        syncStatus,
        wsConnected,
        selectedEntityId,
        initWorkspace,
        resetWorkspace,
        reopenPanel,
        getUnmountedPanels
    } = useWorkspaceStore();

    useEffect(() => {
        initWorkspace();
    }, []);

    const unmounted = getUnmountedPanels();

    return html`
        <div className="workspace-shell">
            <header className="topbar">
                <div className="topbar-left">
                    <span className="brand">❖ AETHER//NEXUS GRIMOIRE OS</span>
                    <span className="badge cyan">
                        ${wsConnected ? '⚡ STREAM: ONLINE' : '◌ STREAM: RECONNECTING'}
                    </span>
                    <span className="badge">FOCUS: ${selectedEntityId}</span>
                    <span className="badge">RUNE-STATE: ${syncStatus}</span>
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
                        ✦ Restore 11-Conduit Sigil
                    </button>
                </div>
            </header>

            <main className="dock-root">
                ${tree
                    ? html`<${DockNode} node=${tree} />`
                    : html`
                        <div style=${{ margin: 'auto', color: '#a78bfa', fontFamily: 'Cinzel, serif' }}>
                            All arcane conduits banished. Use "+ Summon Conduit" or "Restore 11-Conduit Sigil" above.
                        </div>
                    `
                }
            </main>
        </div>
    `;
}

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
