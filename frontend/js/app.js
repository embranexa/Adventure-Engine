import { useEffect, useMemo } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from './html.js';
import { useWorkspaceStore, collectMountedPanels } from './store.js';
import { DockNode } from './components/DockNode.js';
import { ModeSwitch } from './components/ModeSwitch.js';
import { MatterGauge } from './components/MatterGauge.js';
import { Abyss } from './components/Abyss.js';
import { Sigil } from './components/PanelTitle.js';
import { ADVENTURE_TYPES } from './lifecycle.js';

/** Status light for the live connection. @param {FeedStatus} status */
function feedLight(status) {
    switch (status.state) {
        case 'online': return { cls: 'on', label: 'live' };
        case 'retrying': return { cls: 'error', label: `retry ${Math.round((status.retryInMs ?? 0) / 1000)}s` };
        case 'offline': return { cls: 'error', label: 'offline' };
        default: return { cls: '', label: 'connecting' };
    }
}

function App() {
    // Per-field selectors: App re-renders only when one of these values changes
    const panels = useWorkspaceStore((s) => s.panels);
    const tree = useWorkspaceStore((s) => s.tree);
    const feedStatus = useWorkspaceStore((s) => s.feedStatus);
    const initWorkspace = useWorkspaceStore((s) => s.initWorkspace);
    const resetWorkspace = useWorkspaceStore((s) => s.resetWorkspace);
    const reopenPanel = useWorkspaceStore((s) => s.reopenPanel);
    const createAdventure = useWorkspaceStore((s) => s.createAdventure);
    const showPanel = useWorkspaceStore((s) => s.showPanel);

    useEffect(() => {
        initWorkspace();
    }, []);

    const unmounted = useMemo(() => {
        const mounted = collectMountedPanels(tree);
        return Object.keys(panels).filter((id) => !mounted.has(id));
    }, [panels, tree]);

    const light = feedLight(feedStatus);

    return html`
        <${Abyss} />
        <div className="workspace-shell">
            <header className="topbar">
                <span className="brand"><${Sigil} />Adventure Engine</span>
                <${ModeSwitch} />
                <span className="topbar-spacer"></span>
                <span className=${`light ${light.cls}`}><i></i>${light.label}</span>
                <select
                    className="btn new-adventure"
                    aria-label="Make an adventure from scratch"
                    onChange=${(e) => {
                        const type = e.target.value;
                        e.target.value = '';
                        if (!type) return;
                        showPanel('node'); // the new adventure opens there, in edit mode
                        createAdventure(type);
                    }}
                >
                    <option value="">✦ New adventure</option>
                    ${Object.entries(ADVENTURE_TYPES).map(([key, t]) => html`
                        <option key=${key} value=${key}>${t.glyph} ${t.label}</option>
                    `)}
                </select>
                ${unmounted.length > 0 && html`
                    <select
                        className="btn"
                        aria-label="Open a closed panel"
                        onChange=${(e) => {
                            if (e.target.value) {
                                reopenPanel(e.target.value);
                                e.target.value = '';
                            }
                        }}
                    >
                        <option value="">+ Open panel (${unmounted.length})</option>
                        ${unmounted.map((id) => html`
                            <option key=${id} value=${id}>${panels[id]?.name || id}</option>
                        `)}
                    </select>
                `}
                <button className="btn ghost" onClick=${resetWorkspace}>Reset layout</button>
            </header>
            <${MatterGauge} />

            <main className="dock-root">
                ${tree
                    ? html`<${DockNode} node=${tree} />`
                    : html`<div className="empty-dock">No panels open · use Open panel or Reset layout</div>`}
            </main>
        </div>
    `;
}

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
