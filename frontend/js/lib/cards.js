/**
 * True if a click on a card was on something of its own (a control), so it shouldn't select
 * the card. @param {MouseEvent} e
 */
export const onControl = (e) => Boolean(/** @type {Element} */ (e.target).closest?.('button, input, select, textarea, label, a, .ol-menu'));
