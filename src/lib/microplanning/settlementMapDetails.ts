import L from 'leaflet';
import { settlementPinContent, settlementPinData } from './settlementPins';

/** Detached popups survive a clustered marker being redrawn during auto-pan. */
export function attachSettlementDetails(map: L.Map, marker: L.Marker, pin: NonNullable<ReturnType<typeof settlementPinData>>) {
  let popup: L.Popup | null = null;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const cancelClose = () => { if (closeTimer) clearTimeout(closeTimer); };
  const protect = (element?: HTMLElement) => {
    if (!element) return;
    L.DomEvent.disableClickPropagation(element);
    L.DomEvent.disableScrollPropagation(element);
    L.DomEvent.on(element, 'touchstart touchmove touchend pointerdown', L.DomEvent.stopPropagation);
  };
  const open = (event?: L.LeafletMouseEvent) => {
    if (event?.originalEvent) L.DomEvent.stopPropagation(event.originalEvent);
    cancelClose();
    marker.closeTooltip();
    popup = L.popup({ minWidth: 0, maxWidth: 360, className: 'geo-settlement-popup', autoPanPadding: [16, 16] })
      .setLatLng(marker.getLatLng())
      .setContent(settlementPinContent(pin, 'popup'))
      .openOn(map);
    protect(popup.getElement());
    const close = popup.getElement()?.querySelector('.leaflet-popup-close-button');
    close?.setAttribute('aria-label', 'Close settlement details');
  };
  marker.on('click', open);
  // Touch selects the full record directly; Leaflet's click-to-tooltip handler
  // otherwise competes with popup opening and leaves a panel without a close.
  if (window.matchMedia('(any-hover: hover)').matches) {
    marker.bindTooltip(() => settlementPinContent(pin), { direction: 'auto', offset: [0, -16], opacity: 1, interactive: true, className: 'geo-settlement-tooltip' });
    marker.off('mouseout');
    marker.on('mouseout', () => { cancelClose(); closeTimer = setTimeout(() => marker.closeTooltip(), 180); });
    marker.on('mouseover', cancelClose);
    marker.on('tooltipopen', () => {
      if (popup?.isOpen()) { marker.closeTooltip(); return; }
      const tooltip = marker.getTooltip();
      const element = tooltip?.getElement();
      if (!tooltip || !element) return;
      protect(element);
      element.onmouseenter = cancelClose;
      element.onmouseleave = () => marker.closeTooltip();
      element.onclick = () => open();
      const area = map.getContainer().getBoundingClientRect();
      const rect = element.getBoundingClientRect();
      const dx = rect.left < area.left + 8 ? area.left + 8 - rect.left : rect.right > area.right - 8 ? area.right - 8 - rect.right : 0;
      const dy = rect.top < area.top + 8 ? area.top + 8 - rect.top : rect.bottom > area.bottom - 8 ? area.bottom - 8 - rect.bottom : 0;
      if (dx || dy) tooltip.setLatLng(map.containerPointToLatLng(map.latLngToContainerPoint(marker.getLatLng()).add([dx, dy])));
    });
  }
  return () => { cancelClose(); marker.off('click', open); marker.closeTooltip(); popup?.remove(); };
}