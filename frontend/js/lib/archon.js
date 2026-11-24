// Leaving the party, or going back to recruitment, gives up leading: ask first.

import { PARTY_STATUSES } from '../lifecycle.js';
import { archonOf } from './complexGraph.js';
import { confirmHere } from './windows.js';

/** True to go ahead with the change. @param {AdventureRecord} adventure @param {{ id: string, name: string }} player @param {PartyStatus | null} status  null: leaving */
export function mayChange(adventure, player, status) {
    if (archonOf(adventure) !== player.id || (status && PARTY_STATUSES[status].stage !== 'recruitment')) return true;
    return confirmHere(`${player.name} is the archon of “${adventure.title}”, and would no longer lead it. Continue?`);
}
