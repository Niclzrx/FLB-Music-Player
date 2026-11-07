export function bingAnArtist (artist: string) {
  // Open the Meld view. The outstanding query is also kept on window so the
  // component can pick it up if it has not mounted yet.
  const meldButton = document.querySelector('#FLBing') as HTMLDivElement | null;
  if (meldButton) {
    meldButton.click();
    meldButton.querySelector('a')?.click();
  }
  (window as any).__FLB_MELD_PENDING_SEARCH__ = artist;
  window.dispatchEvent(new CustomEvent('flb-meld-search', { detail: artist }));
  // When Meld is already mounted the event above handled the search, so the
  // queued query must not run again on the next visit.
  if (document.querySelector('.MeldView')) {
    delete (window as any).__FLB_MELD_PENDING_SEARCH__;
  }
}
