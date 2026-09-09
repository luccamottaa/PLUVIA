(function () {
  if (!navigator.geolocation) return;
  const orig = navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
  window.__pluviaGeo = orig;
  let swallowedBoot = false;
  navigator.geolocation.getCurrentPosition = function (success, error, opts) {
    if (!window.__pluviaAllowGeo && !swallowedBoot) {
      swallowedBoot = true;
      return;
    }
    return orig(success, error, opts);
  };
})();
