import { useEffect, useRef, useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore, telemetry, isMapActive as resolveMapActive } from '../store.js';

/** @param {{ panelId: PanelId, radarMode?: boolean }} props */
function ArcaneVirtualMap({ panelId, radarMode = false }) {
    const canvasRef = useRef(/** @type {HTMLCanvasElement | null} */ (null));
    const selectedEntityId = useWorkspaceStore((s) => s.selectedEntityId);
    const setSelectedEntity = useWorkspaceStore((s) => s.setSelectedEntity);

    // Persistent interpolation storage per instance
    const coordsRef = useRef(/** @type {Record<string, { x: number, y: number }>} */ ({}));

    // Read selection through a ref so changing it doesn't restart the draw loop
    const selectedRef = useRef(selectedEntityId);
    selectedRef.current = selectedEntityId;

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const parent = canvas.parentElement;
        const ctx = canvas.getContext('2d');
        if (!parent || !ctx) return;

        // Logical (CSS pixel) size; the backing store is scaled by devicePixelRatio
        let w = 0;
        let h = 0;
        let gridLayer = null;

        const buildGridLayer = (dpr) => {
            const layer = document.createElement('canvas');
            layer.width = canvas.width;
            layer.height = canvas.height;
            const g = /** @type {CanvasRenderingContext2D} */ (layer.getContext('2d'));
            g.scale(dpr, dpr);
            g.strokeStyle = 'rgba(139, 92, 246, 0.08)';
            g.lineWidth = 1;
            const step = 28;
            g.beginPath();
            for (let x = 0; x < w; x += step) { g.moveTo(x, 0); g.lineTo(x, h); }
            for (let y = 0; y < h; y += step) { g.moveTo(0, y); g.lineTo(w, y); }
            g.stroke();
            return layer;
        };

        const resizeObserver = new ResizeObserver(() => {
            const dpr = window.devicePixelRatio || 1;
            w = parent.clientWidth;
            h = parent.clientHeight;
            canvas.width = Math.round(w * dpr);
            canvas.height = Math.round(h * dpr);
            ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // resizing resets the transform
            gridLayer = w > 0 && h > 0 ? buildGridLayer(dpr) : null;
        });
        resizeObserver.observe(parent);

        let animationFrameId;
        let sweepAngleLocal = 0;

        const draw = () => {
            if (w > 0 && h > 0) {
                ctx.clearRect(0, 0, w, h);
                const cx = w / 2;
                const cy = h / 2;
                const maxR = Math.min(w, h) * 0.42;
                const selectedId = selectedRef.current;

                // Read directly from non-reactive buffer
                const rawEntities = telemetry.current.entities || [];

                // --- A. Grid Background (pre-rendered on resize) ---
                if (gridLayer) ctx.drawImage(gridLayer, 0, 0, w, h);

                // --- B. Sacred Geometry Concentric Rings ---
                [0.35, 0.68, 1.0].forEach((factor, idx) => {
                    ctx.beginPath();
                    ctx.arc(cx, cy, maxR * factor, 0, Math.PI * 2);
                    ctx.strokeStyle = idx === 1 ? 'rgba(0, 240, 255, 0.22)' : 'rgba(168, 85, 247, 0.18)';
                    ctx.setLineDash(idx === 1 ? [4, 4] : []);
                    ctx.stroke();
                });
                ctx.setLineDash([]);

                // --- C. Local Sweep Beam (60 FPS smooth rotation) ---
                if (radarMode) {
                    sweepAngleLocal = (sweepAngleLocal + 2.2) % 360;
                    const rad = (sweepAngleLocal * Math.PI) / 180;
                    ctx.beginPath();
                    ctx.moveTo(cx, cy);
                    ctx.arc(cx, cy, maxR, rad - 0.35, rad);
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(0, 240, 255, 0.12)';
                    ctx.fill();
                }

                // --- D. Smooth Interpolation (Lerp) ---
                const renderedPositions = [];
                rawEntities.forEach((ent) => {
                    if (!coordsRef.current[ent.id]) {
                        coordsRef.current[ent.id] = { x: ent.x, y: ent.y };
                    } else {
                        const cur = coordsRef.current[ent.id];
                        cur.x += (ent.x - cur.x) * 0.12; // 12% glide per frame
                        cur.y += (ent.y - cur.y) * 0.12;
                    }
                    renderedPositions.push({
                        ...ent,
                        renderX: coordsRef.current[ent.id].x * w,
                        renderY: coordsRef.current[ent.id].y * h,
                    });
                });

                // --- E. Ley-Line Network Mesh ---
                if (renderedPositions.length > 1) {
                    ctx.beginPath();
                    renderedPositions.forEach((pos, i) => {
                        if (i === 0) ctx.moveTo(pos.renderX, pos.renderY);
                        else ctx.lineTo(pos.renderX, pos.renderY);
                    });
                    ctx.closePath();
                    ctx.strokeStyle = 'rgba(0, 240, 255, 0.16)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                }

                // --- F. Glowing Particle Nodes ---
                renderedPositions.forEach((pos) => {
                    const isSel = pos.id === selectedId;

                    if (isSel) {
                        const pulse = 13 + 2.5 * Math.sin(Date.now() / 140);
                        ctx.beginPath();
                        ctx.arc(pos.renderX, pos.renderY, pulse, 0, Math.PI * 2);
                        ctx.strokeStyle = 'rgba(0, 240, 255, 0.9)';
                        ctx.lineWidth = 1.5;
                        ctx.stroke();
                    }

                    ctx.beginPath();
                    ctx.arc(pos.renderX, pos.renderY, 5, 0, Math.PI * 2);
                    ctx.fillStyle = pos.color;
                    ctx.shadowColor = pos.color;
                    ctx.shadowBlur = 10;
                    ctx.fill();
                    ctx.shadowBlur = 0;

                    ctx.fillStyle = isSel ? '#00f0ff' : '#cbd5e1';
                    ctx.font = '600 10px "JetBrains Mono", monospace';
                    ctx.fillText(pos.id, pos.renderX + 8, pos.renderY + 3);
                });
            }

            animationFrameId = requestAnimationFrame(draw);
        };

        draw();

        return () => {
            cancelAnimationFrame(animationFrameId);
            resizeObserver.disconnect();
        };
    }, [radarMode]);

    const handleCanvasClick = (e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const clickX = (e.clientX - rect.left) / rect.width;
        const clickY = (e.clientY - rect.top) / rect.height;

        let closest = null;
        let minDist = 0.08;
        (telemetry.current.entities || []).forEach((ent) => {
            const dist = Math.hypot(ent.x - clickX, ent.y - clickY);
            if (dist < minDist) {
                minDist = dist;
                closest = ent.id;
            }
        });
        if (closest) setSelectedEntity(closest);
    };

    return html`
        <div className="arcane-frame" style=${{ padding: '6px' }}>
            <canvas ref=${canvasRef} className="map-canvas" onClick=${handleCanvasClick} />
            <div className="map-hud-overlay">
                <span className="hud-chip">NODE // ${panelId.toUpperCase()}</span>
                <span className="hud-chip">TARGET // ${selectedEntityId}</span>
            </div>
        </div>
    `;
}

/** @param {{ panelId: PanelId }} props */
export function PanelContent({ panelId }) {
    const meta = useWorkspaceStore((s) => s.panels[panelId]) || { title: panelId, category: 'ARCANE', status: 'OK' };
    const selectedEntityId = useWorkspaceStore((s) => s.selectedEntityId);
    const setSelectedEntity = useWorkspaceStore((s) => s.setSelectedEntity);
    const togglePanelMapMode = useWorkspaceStore((s) => s.togglePanelMapMode);
    const isMapActive = useWorkspaceStore((s) => resolveMapActive(s.mapModes, panelId));

    // Low-frequency polling for HUD text; the map view draws from the buffer itself,
    // so the timer only runs while the HUD is showing.
    const [hudData, setHudData] = useState(() => telemetry.current);

    useEffect(() => {
        if (isMapActive) return;
        setHudData(telemetry.current);
        const timer = setInterval(() => {
            setHudData(telemetry.current);
        }, 120); // 8 Hz HUD text update is plenty for human reading
        return () => clearInterval(timer);
    }, [isMapActive]);

    const activeEntity =
        (hudData.entities || []).find((e) => e.id === selectedEntityId) ||
        (hudData.entities || [])[0] ||
        { id: 'VALKYRIE-01', name: 'Seraphim Cyber-Knight', faction: 'AETHER-CORP', mana: 90, x: 0.5, y: 0.5 };

    return html`
        <div className="panel-body">
            <div className="panel-meta">
                <span>SIGIL // ${meta.category}</span>
                <div style=${{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <button
                        className="btn"
                        style=${{ padding: '1px 6px', fontSize: '10px' }}
                        onClick=${() => togglePanelMapMode(panelId)}
                        title="Toggle Virtual Arcane Map inside this panel"
                    >
                        ${isMapActive ? '◈ HUD VIEW' : '❖ MAP VIEW'}
                    </button>
                    <span className="status-pill">✦ ${meta.status}</span>
                </div>
            </div>

            ${isMapActive
                ? html`<${ArcaneVirtualMap} panelId=${panelId} radarMode=${panelId === 'p5'} />`
                : html`
                    <div className="arcane-frame">
                        <div>
                            <div style=${{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span style=${{ fontWeight: 700, fontSize: '13px', color: '#f8fafc', letterSpacing: '0.5px' }}>
                                    ${meta.title}
                                </span>
                                <span style=${{ fontFamily: 'JetBrains Mono', fontSize: '10px', color: '#f59e0b' }}>
                                    SYNC // ${activeEntity.id}
                                </span>
                            </div>

                            <div style=${{ fontSize: '11px', color: '#94a3b8', marginTop: '4px', marginBottom: '8px' }}>
                                Tracking <strong style=${{ color: '#00f0ff' }}>${activeEntity.name}</strong> (${activeEntity.faction})
                                at Ley-Coords [${activeEntity.x}, ${activeEntity.y}].
                            </div>

                            ${(hudData.entities || []).map((ent) => html`
                                <div
                                    key=${ent.id}
                                    className=${`entity-row ${ent.id === selectedEntityId ? 'selected' : ''}`}
                                    onClick=${() => setSelectedEntity(ent.id)}
                                >
                                    <span style=${{ color: ent.color, fontWeight: 600 }}>◆ ${ent.id}</span>
                                    <span style=${{ fontFamily: 'JetBrains Mono', fontSize: '10px', color: '#cbd5e1' }}>
                                        MANA ${ent.mana}%
                                    </span>
                                </div>
                            `)}
                        </div>

                        <div>
                            <div style=${{ display: 'flex', justifyContent: 'space-between', fontSize: '10px', fontFamily: 'JetBrains Mono', color: '#c084fc' }}>
                                <span>AETHER RESONANCE FLUX</span>
                                <span>${hudData.aetherFlux || 88}%</span>
                            </div>
                            <div className="metric-bar">
                                <div className="metric-fill" style=${{ width: `${hudData.aetherFlux || 88}%` }}></div>
                            </div>
                        </div>
                    </div>
                `
            }
        </div>
    `;
}