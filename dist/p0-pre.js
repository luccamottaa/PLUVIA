(function () {
  if (!navigator.geolocation) return;
  const orig = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  window.__pluviaGeo = orig;
  navigator.geolocation.getCurrentPosition = function (success, error, opts) {
    if (!window.__pluviaAllowGeo) return;
    return orig(success, error, opts);
  };
})();
