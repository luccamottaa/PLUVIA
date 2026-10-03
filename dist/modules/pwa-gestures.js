/* Installed-app page gestures; map zoom remains controlled by Leaflet. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else factory(root);
})(typeof window !== 'undefined' ? window : globalThis, function (scope) {
  const document = scope.document;
  const mode = scope.matchMedia('(display-mode: standalone)');
  const events = ['gesturestart', 'gesturechange'];
  const preventPageZoom = event => {
    if (!event.target?.closest?.('#weatherMap')) event.preventDefault();
  };
  const sync = () => {
    const installed = mode.matches || scope.navigator.standalone === true;
    document.documentElement.toggleAttribute('data-pwa-no-zoom', installed);
    // Safari's gesture events supplement touch-action. Never cancel ordinary
    // touches, scrolling, text selection or Leaflet's own pinch handling.
    for (const name of events) {
      if (installed) document.addEventListener(name, preventPageZoom, {passive:false});
      else document.removeEventListener(name, preventPageZoom);
    }
  };
  mode.addEventListener('change', sync);
  sync();
});
