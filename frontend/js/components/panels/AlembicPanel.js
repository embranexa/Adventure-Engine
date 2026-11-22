import { useEffect, useMemo, useRef, useState } from 'react';
import { html } from '../../html.js';
import { useWorkspaceStore } from '../../store.js';
import {
    addAction, analyze, orEmpty, promotionTarget, removeAction, renameAction, roadmapColors, setNotes, toggleDone, toggleLink,
} from '../../lib/roadmap.js';
import { PromoteButton } from '../PromoteButton.js';
import { focusedWindow } from '../../lib/windows.js';

/**
 * Controls for the selected action: rename, complete/undo, link, add the next action,
 * delete, and its notes (free text, saved when you leave the box; shown in the Crucible).
 * @param {{ info: import('../../lib/roadmap.js').ActionInfo, linking: boolean, waiting: string[],
 *           onRename: (t: string) => void, onNotes: (t: string) => void, onToggle: () => void, onLink: () => void,
 *           onAddNext: () => void, onDelete: () => void, autoFocus: boolean }} props
 */
function ActionBar({ info, linking, waiting, onRename, onNotes, onToggle, onLink, onAddNext, onDelete, autoFocus }) {
    const [draft, setDraft] = useState(info.title);
    const [notes, setNotesDraft] = useState(info.notes);
    useEffect(() => setNotesDraft(info.notes), [info.id, info.notes]);
    const inputRef = useRef(/** @type {HTMLInputElement | null} */ (null));
    useEffect(() => setDraft(info.title), [info.id, info.title]);
    useEffect(() => {
        if (autoFocus) { inputRef.current?.focus(); inputRef.current?.select(); }
    }, [info.id, autoFocus]);

    const commit = () => { if (draft.trim() && draft !== info.title) onRename(draft); else setDraft(info.title); };

    return html`
        <div className="alm-bar" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
            <span className=${`alm-bar-id state-${info.state}`}>${info.id}</span>
            <input
                ref=${inputRef}
                className="alm-bar-title"
                value=${draft}
                maxLength=${200}
                aria-label="Action title"
                onInput=${(/** @type {any} */ e) => setDraft(e.target.value)}
                onBlur=${commit}
                onKeyDown=${(/** @type {KeyboardEvent} */ e) => {
                    if (e.key === 'Enter') /** @type {HTMLInputElement} */ (e.target).blur();
                    if (e.key === 'Escape') { setDraft(info.title); /** @type {HTMLInputElement} */ (e.target).blur(); }
                }}
            />
            ${info.state === 'locked'
                ? html`<span className="alm-bar-locked" title=${`Waiting on: ${waiting.join(', ')}`}>Locked</span>`
                : html`<button className=${`btn alm-complete ${info.state}`} onClick=${onToggle}>
                    ${info.state === 'done' ? '↺ Undo' : '✓ Complete'}
                  </button>`}
            <button className=${`btn ${linking ? 'on' : ''}`} onClick=${onLink}
                title="Then click another action to make it come after this one (click a linked one to unlink)">⟶ Link</button>
            <button className="btn" onClick=${onAddNext} title="Add an action that comes after this one">+ Next</button>
            <button className="btn ghost alm-delete" onClick=${onDelete} title="Delete this action">✕</button>
            <textarea className="alm-bar-notes" rows=${notes ? 3 : 1} maxLength=${2000} placeholder="Notes (optional)…" aria-label="Action notes"
                value=${notes} spellCheck=${true}
                onInput=${(/** @type {any} */ e) => setNotesDraft(e.target.value)}
                onBlur=${() => { if (notes.trim() !== info.notes) onNotes(notes); }}
                onKeyDown=${(/** @type {KeyboardEvent} */ e) => {
                    if (e.key === 'Escape') { setNotesDraft(info.notes); /** @type {HTMLElement} */ (e.target).blur(); }
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) /** @type {HTMLElement} */ (e.target).blur();
                }}></textarea>
        </div>
    `;
}

/**
 * The Alembic: the selected adventure's action roadmap. Follows the selection like the
 * node card. Edit in 3D (select, link, add, complete) or as text in the Scripter panel.
 */
export function AlembicPanel() {
    const item = useWorkspaceStore((s) => (s.selectedItemId ? s.itemsById[s.selectedItemId] : null));
    const saveRoadmap = useWorkspaceStore((s) => s.saveRoadmap);
    const roadmapError = useWorkspaceStore((s) => s.roadmapError);
    const showPanel = useWorkspaceStore((s) => s.showPanel);

    const adventure = item?.kind === 'adventure' ? item : null;
    const roadmap = orEmpty(adventure?.roadmap);
    const analysis = useMemo(() => analyze(roadmap), [roadmap]);
    const titles = useMemo(() => new Map(roadmap.actions.map((a) => [a.id, a.title])), [roadmap]);

    const hostRef = useRef(/** @type {HTMLDivElement | null} */ (null));
    const sceneRef = useRef(/** @type {any} */ (null));
    const [status, setStatus] = useState(/** @type {'loading' | 'ready' | 'error'} */ ('loading'));
    const [selected, setSelected] = useState(/** @type {string | null} */ (null));
    const [linkFrom, setLinkFrom] = useState(/** @type {string | null} */ (null));
    const [notice, setNotice] = useState(/** @type {string | null} */ (null));
    const [focusTitle, setFocusTitle] = useState(false);

    // a new adventure: drop the action selection, reframe the view
    const shownId = useRef(/** @type {string | null} */ (null));
    const refit = shownId.current !== (adventure?.id ?? null);
    useEffect(() => {
        setSelected(null);
        setLinkFrom(null);
        setNotice(null);
    }, [adventure?.id]);

    const selectedInfo = selected ? analysis.byId.get(selected) ?? null : null;

    /** @param {Roadmap} next */
    const save = (next) => { if (adventure) saveRoadmap(adventure.id, next); };
    /** @param {string} msg */
    const flash = (msg) => {
        setNotice(msg);
        clearTimeout(/** @type {any} */ (flash).t);
        /** @type {any} */ (flash).t = setTimeout(() => setNotice(null), 3200);
    };

    // The scene is created once; it calls the latest handlers through this ref.
    const handlers = useRef({
        select: (/** @type {string | null} */ id) => {},
        activate: (/** @type {string} */ id) => {},
    });
    handlers.current.select = (id) => {
        setFocusTitle(false);
        if (linkFrom && id && id !== linkFrom) {
            const { roadmap: next, error } = toggleLink(roadmap, linkFrom, id);
            if (error) flash(error);
            else save(next);
            setLinkFrom(null);
            setSelected(id);
            return;
        }
        setLinkFrom(null);
        setSelected(id);
    };
    handlers.current.activate = (id) => {
        const info = analysis.byId.get(id);
        if (!info) return;
        if (info.state === 'locked') {
            flash(`${info.id} is locked: finish ${info.parents.filter((p) => analysis.byId.get(p)?.state !== 'done').join(', ')} first`);
            return;
        }
        save(toggleDone(roadmap, id));
    };

    // Load three.js + the scene only when this panel opens.
    useEffect(() => {
        let disposed = false;
        // ?v= forces one fresh download past a copy cached before the server sent
        // Cache-Control: no-cache (a hard reload doesn't bypass the cache for lazy imports).
        // @ts-ignore -- the query string hides the module's path from the type checker
        import('../../lib/alembicScene.js?v=3')
            .then(({ AlembicScene }) => {
                if (disposed || !hostRef.current) return;
                sceneRef.current = new AlembicScene(hostRef.current, {
                    onSelect: (/** @type {string | null} */ id) => handlers.current.select(id),
                    onActivate: (/** @type {string} */ id) => handlers.current.activate(id),
                });
                setStatus('ready');
            })
            .catch((err) => {
                console.error('[alembic] failed to start', err);
                if (!disposed) setStatus('error');
            });
        return () => {
            disposed = true;
            sceneRef.current?.dispose();
            sceneRef.current = null;
        };
    }, []);

    // the actions' colours follow the adventure's matter (roadmapColors)
    const colors = roadmapColors(adventure?.phase ?? 'decomposing');
    useEffect(() => {
        if (!sceneRef.current) return;
        sceneRef.current.setColors(colors.todo, colors.done);
        sceneRef.current.update(analysis, { selectedId: selected, linkFromId: linkFrom, refit });
        shownId.current = adventure?.id ?? null;
    }, [analysis, selected, linkFrom, status, adventure?.id, colors.todo, colors.done]);

    // finishing the last action makes every still flare
    const wasComplete = useRef({ id: /** @type {string | null} */ (null), complete: false });
    useEffect(() => {
        const prev = wasComplete.current;
        if (adventure && prev.id === adventure.id && !prev.complete && analysis.complete) sceneRef.current?.celebrate();
        wasComplete.current = { id: adventure?.id ?? null, complete: analysis.complete };
    }, [analysis.complete, adventure?.id]);

    // Esc leaves link mode
    useEffect(() => {
        if (!linkFrom) return;
        const onKey = (/** @type {KeyboardEvent} */ e) => { if (e.key === 'Escape') setLinkFrom(null); };
        const win = focusedWindow(); // the panel's window (it may be popped out)
        win.addEventListener('keydown', onKey);
        return () => win.removeEventListener('keydown', onKey);
    }, [linkFrom]);

    useEffect(() => { if (roadmapError) flash(roadmapError); }, [roadmapError]);

    /** @param {string | null} parentId */
    const add = (parentId) => {
        const { roadmap: next, id } = addAction(roadmap, 'New action', parentId);
        save(next);
        setSelected(id);
        setLinkFrom(null);
        setFocusTitle(true);
    };

    const target = adventure ? promotionTarget(adventure.phase) : null;
    const pct = analysis.total ? Math.round((analysis.doneCount / analysis.total) * 100) : 0;

    return html`
        <div className="panel-body alembic" style=${{ '--todo': colors.todo, '--done': colors.done }}>
            <div className="alm-host" ref=${hostRef}></div>
            ${status === 'ready' && analysis.actions.length > 0 && html`
                <button className="btn view-home" title="Frame everything" onClick=${() => sceneRef.current?.fit(analysis)}>⌂</button>
            `}

            ${status !== 'ready' && html`
                <div className="map-status">${status === 'loading' ? 'Heating the Alembic…' : 'Alembic failed to load (see console)'}</div>
            `}

            ${status === 'ready' && !adventure && html`
                <div className="nc-empty alm-overlay-empty">
                    ${item ? 'Raw events have no roadmap' : 'Nothing selected'}
                    <small>${item ? 'Pass it first: it becomes ore' : 'Select an adventure to break it into actions'}</small>
                </div>
            `}

            ${status === 'ready' && adventure && html`
                <div className="alm-hud" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
                    ${analysis.total > 0 && html`
                        <span className="alm-progress" title=${`${analysis.bottlenecks.length} ready now`}>
                            <b>${analysis.doneCount}</b> / ${analysis.total} distilled
                            <span className="alm-meter"><i style=${{ width: `${pct}%` }}></i></span>
                        </span>
                    `}
                    <button className="cls-layer" onClick=${() => add(null)} title="Add an action that doesn't depend on anything">+ Action</button>
                    <button className="cls-layer" onClick=${() => showPanel('scripter')} title="Edit the roadmap as text in the Scripter">Script ⟶</button>
                </div>

                ${analysis.total === 0 && html`
                    <div className="alm-empty" onPointerDown=${(/** @type {Event} */ e) => e.stopPropagation()}>
                        <span>No roadmap yet</span>
                        <small>Break this adventure into actions: what has to happen, and in what order?</small>
                        <div>
                            <button className="btn" onClick=${() => add(null)}>+ First action</button>
                            <button className="btn ghost" onClick=${() => showPanel('scripter')}>Write a script</button>
                        </div>
                    </div>
                `}

                ${linkFrom && html`<div className="alm-notice link">Click the action that comes after ${linkFrom} · click a linked one to unlink · Esc to cancel</div>`}
                ${!linkFrom && notice && html`<div className="alm-notice">${notice}</div>`}

                <div className="alm-bottom">
                    ${analysis.complete && target && html`<${PromoteButton} key=${adventure.id} adventureId=${adventure.id} target=${target} />`}
                    ${selectedInfo && html`
                        <${ActionBar}
                            info=${selectedInfo}
                            waiting=${selectedInfo.parents.filter((p) => analysis.byId.get(p)?.state !== 'done').map((p) => `${p} ${titles.get(p) ?? ''}`.trim())}
                            linking=${linkFrom === selectedInfo.id}
                            autoFocus=${focusTitle}
                            onRename=${(/** @type {string} */ t) => save(renameAction(roadmap, selectedInfo.id, t))}
                            onNotes=${(/** @type {string} */ t) => save(setNotes(roadmap, selectedInfo.id, t))}
                            onToggle=${() => handlers.current.activate(selectedInfo.id)}
                            onLink=${() => setLinkFrom(linkFrom === selectedInfo.id ? null : selectedInfo.id)}
                            onAddNext=${() => add(selectedInfo.id)}
                            onDelete=${() => { save(removeAction(roadmap, selectedInfo.id)); setSelected(null); }}
                        />
                    `}
                    ${!selectedInfo && analysis.total > 0 && html`
                        <div className="cls-hint alm-hint">Click: select · double-click: complete · left-drag: rotate · right-drag: move · scroll: zoom</div>
                    `}
                </div>
            `}
        </div>
    `;
}
