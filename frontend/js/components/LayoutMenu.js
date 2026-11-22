import { useEffect, useRef, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';

/**
 * Layouts, like Blender's workspaces: save the current dock arrangement under a name,
 * switch to a saved one in one click, delete one. Saved on the server (layout_presets).
 */
export function LayoutMenu() {
    const presets = useWorkspaceStore((s) => s.layoutPresets);
    const save = useWorkspaceStore((s) => s.saveLayoutPreset);
    const apply = useWorkspaceStore((s) => s.applyLayoutPreset);
    const remove = useWorkspaceStore((s) => s.deleteLayoutPreset);
    const [open, setOpen] = useState(false);
    const [name, setName] = useState('');
    const ref = useRef(/** @type {HTMLDivElement | null} */ (null));

    // a click anywhere else closes it
    useEffect(() => {
        if (!open) return;
        const onDown = (/** @type {PointerEvent} */ e) => { if (ref.current && !ref.current.contains(/** @type {Node} */ (e.target))) setOpen(false); };
        const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') setOpen(false); };
        window.addEventListener('pointerdown', onDown);
        window.addEventListener('keydown', onKey);
        return () => { window.removeEventListener('pointerdown', onDown); window.removeEventListener('keydown', onKey); };
    }, [open]);

    const submit = (/** @type {Event} */ e) => {
        e.preventDefault();
        if (!name.trim()) return;
        save(name);
        setName('');
    };
    const exists = presets.some((p) => p.name === name.trim());

    return html`
        <div className="layout-menu" ref=${ref}>
            <button className=${`btn ghost ${open ? 'on' : ''}`} aria-expanded=${open} onClick=${() => setOpen(!open)}
                title="Saved layouts: switch, save the current one, delete">▤ Layouts</button>
            ${open && html`
                <div className="layout-pop" role="menu">
                    ${presets.length === 0 && html`<div className="layout-empty">No saved layouts yet</div>`}
                    ${presets.map((p) => html`
                        <div key=${p.name} className="layout-row">
                            <button className="layout-apply" role="menuitem" onClick=${() => { apply(p.name); setOpen(false); }}
                                title=${`Switch to “${p.name}”`}>${p.name}</button>
                            <button className="layout-del" onClick=${() => remove(p.name)} title=${`Delete “${p.name}”`} aria-label=${`Delete ${p.name}`}>✕</button>
                        </div>
                    `)}
                    <form className="layout-save" onSubmit=${submit}>
                        <input value=${name} maxLength=${60} placeholder="Name this layout…"
                            onInput=${(/** @type {any} */ e) => setName(e.target.value)} />
                        <button className="btn" type="submit" disabled=${!name.trim()}>${exists ? 'Replace' : 'Save'}</button>
                    </form>
                </div>
            `}
        </div>
    `;
}
