(function () {
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch {}
  const pinTop = () => {
    const hash = (location.hash || "").toLowerCase();
    if (!hash || hash === "#agora" || hash === "#top") {
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  };
  pinTop();
  window.addEventListener("DOMContentLoaded", pinTop);
  window.addEventListener("load", pinTop);

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
