/**
 * Opens a document (invoice/workorder/estimate/etc.) in a small, separate
 * popup window sized for print preview -- like Amazon's order-invoice
 * popup -- instead of navigating the current tab (which forced a Back
 * click to return to whatever list the user was on) or opening a full
 * same-size browser tab. Falls back to a normal new tab if the browser
 * blocks the popup (e.g. not called directly from a user gesture).
 */
export function openPrintPopup(url: string): void {
  const width = 900;
  const height = 1000;
  const left = Math.max(0, (window.screen.width - width) / 2);
  const top = Math.max(0, (window.screen.height - height) / 2);
  const win = window.open(
    url,
    "_blank",
    `popup=yes,width=${width},height=${height},left=${left},top=${top},resizable=yes,scrollbars=yes,toolbar=no,menubar=no,location=no,status=no`
  );
  if (!win) {
    window.open(url, "_blank", "noopener,noreferrer");
  }
}
