import { useEffect, useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { html } from './html.js';
import { useWorkspaceStore, collectMountedPanels, dockedTree } from './store.js';
import { DockNode } from './components/DockNode.js';
import { ModeSwitch } from './components/ModeSwitch.js';
import { MatterGauge } from './components/MatterGauge.js';
import { Abyss, WORLDS, saveWorld, savedWorld } from './components/Abyss.js';
import { Sigil } from './components/PanelTitle.js';
import { LayoutMenu } from './components/LayoutMenu.js';
import { EpitaphToast } from './components/EpitaphToast.js';
import { UndoToast } from './components/UndoToast.js';
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
    const poppedOut = useWorkspaceStore((s) => s.poppedOut);
    const [world, setWorld] = useState(savedWorld); // the world outside the window
    // the main dock leaves out panels shown in their own window
    const docked = useMemo(() => dockedTree(tree, new Set(poppedOut)), [tree, poppedOut]);

    useEffect(() => {
        initWorkspace();
    }, []);

    const unmounted = useMemo(() => {
        const mounted = collectMountedPanels(tree);
        return Object.keys(panels).filter((id) => !mounted.has(id));
    }, [panels, tree]);

    const light = feedLight(feedStatus);

    return html`
        <${Abyss} world=${world} />
        <${UndoToast} />
        <${EpitaphToast} />
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
                <select className="btn ghost window-select" aria-label="The world outside the window" title="The world outside the window"
                    value=${world} onChange=${(e) => { setWorld(e.target.value); saveWorld(e.target.value); }}>
                    ${WORLDS.map((w) => html`<option key=${w.key} value=${w.key}>◐ ${w.label}</option>`)}
                </select>
                <${LayoutMenu} />
                <button className="btn ghost" onClick=${resetWorkspace}>Reset layout</button>
            </header>
            <${MatterGauge} />

            <main className="dock-root">
                ${docked
                    ? html`<${DockNode} node=${docked} />`
                    : html`<div className="empty-dock">${tree ? 'Every panel is in its own window' : 'No panels open · use Open panel or Reset layout'}</div>`}
            </main>
        </div>
    `;
}

const root = createRoot(document.getElementById('root'));
root.render(html`<${App} />`);
