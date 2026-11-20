// Panel registry: maps a panel's `kind` (set in backend/services/workspace.py)
// to the component that renders its body. To add a panel type, add a component
// here and give a panel that kind on the server.

import { AlembicPanel } from './AlembicPanel.js';
import { CalendarPanel } from './CalendarPanel.js';
import { ClassifierPanel } from './ClassifierPanel.js';
import { MapPanel } from './MapPanel.js';
import { NodeCard } from './NodeCard.js';
import { QuestsPanel } from './QuestsPanel.js';

/** @type {Record<PanelKind, (props: { panelId: PanelId }) => any>} */
export const PANEL_COMPONENTS = {
    node: NodeCard,
    calendar: CalendarPanel,
    map: MapPanel,
    classifier: ClassifierPanel,
    alembic: AlembicPanel,
    quests: QuestsPanel,
};
