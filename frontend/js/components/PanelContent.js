import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PANEL_COMPONENTS } from './panels/index.js';

/** Renders a panel's body with the component registered for its kind. @param {{ panelId: PanelId }} props */
export function PanelContent({ panelId }) {
    const kind = useWorkspaceStore((s) => s.panels[panelId]?.kind);
    const Component = kind ? PANEL_COMPONENTS[kind] : undefined;
    if (!Component) return html`<div className="panel-body panel-unknown">Unknown panel: ${panelId}</div>`;
    return html`<${Component} panelId=${panelId} />`;
}
