import { useState } from 'react';
import { html } from '../html.js';
import { useWorkspaceStore } from '../store.js';
import { PHASE_STAGES } from '../lifecycle.js';

const SPARKS = Array.from({ length: 14 }, (_, i) => {
    const angle = (i / 14) * Math.PI * 2 + (i % 2) * 0.2;
    const dist = 60 + (i % 3) * 22;
    return { dx: `${Math.round(Math.cos(angle) * dist)}px`, dy: `${Math.round(Math.sin(angle) * dist * 0.6)}px`, delay: `${(i % 4) * 30}ms` };
});

/**
 * The reward for finishing a roadmap: a radiant button that promotes the adventure to
 * its next phase. Bursts into sparks when pressed, then moves it.
 * @param {{ adventureId: string, target: Phase, compact?: boolean }} props
 */
export function PromoteButton({ adventureId, target, compact = false }) {
    const setPhase = useWorkspaceStore((s) => s.setPhase);
    const [fired, setFired] = useState(false);
    const stage = PHASE_STAGES[target];

    const fire = () => {
        if (fired) return;
        setFired(true);
        setTimeout(() => setPhase(adventureId, target), 650); // let the burst play first
    };

    return html`
        <button
            className=${`promote ${compact ? 'compact' : ''} ${fired ? 'fired' : ''}`}
            style=${{ '--c': stage.color, '--l': stage.light }}
            onClick=${fire}
            title=${`Roadmap complete: move it to the ${stage.module} (${stage.matter})`}
        >
            <span className="promote-shine"></span>
            <span className="promote-text">
                <small>Roadmap complete</small>
                <span>✦ Promote → ${stage.module}</span>
            </span>
            <span className="promote-sparks" aria-hidden="true">
                ${SPARKS.map((s, i) => html`<i key=${i} style=${{ '--dx': s.dx, '--dy': s.dy, animationDelay: s.delay }}></i>`)}
            </span>
        </button>
    `;
}
