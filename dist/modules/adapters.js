/* Fachadas: preservam os pontos de entrada existentes sem duplicar estado. */
Object.assign(PLUVIA.modules.weather,{refresh:()=>loadWeather(),validate:validForecast});
Object.assign(PLUVIA.modules.alerts,{refresh:()=>loadInmetAlerts(),select:selectInmetAlerts});
Object.assign(PLUVIA.modules.location,{choose:chooseCity,locate:requestLocation,search:searchCities});
Object.assign(PLUVIA.modules['air-quality'],{guidance:airGuidance});
Object.assign(PLUVIA.modules.disasters,{refresh:()=>loadDefesaAlerts()});
Object.assign(PLUVIA.modules.auth,{open:()=>document.getElementById('accountButton').click()});
Object.assign(PLUVIA.modules.map,{load:loadRainMap});
Object.assign(PLUVIA.modules['weather-layers'],{status:'not-integrated'});
