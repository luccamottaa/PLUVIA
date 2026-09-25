/* Fachadas: preservam os pontos de entrada existentes sem duplicar estado. */
Object.assign(PLUVIA.modules.weather,{refresh:()=>loadWeather(),validate:validForecast,snapshot:()=>PLUVIA.weatherData?.get(activeCity?.id)});
Object.assign(PLUVIA.modules.alerts,{refresh:()=>loadInmetAlerts(),select:selectInmetAlerts});
Object.assign(PLUVIA.modules.location,{choose:chooseCity,locate:requestLocation,search:searchCities});
Object.assign(PLUVIA.modules['air-quality'],{guidance:aqiLabel});
Object.assign(PLUVIA.modules.auth,{open:()=>document.getElementById('accountButton').click()});
Object.assign(PLUVIA.modules['weather-layers'],{status:'not-integrated'});
