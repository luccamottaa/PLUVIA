const city = {id:'1302603',name:'Manaus',uf:'AM',lat:-3.119,lon:-60.022,timezone:'America/Manaus'};
function forecast(day='2026-10-01',hour=12) {
  const date=Date.parse(day+'T00:00:00Z');
  const hourly={time:Array.from({length:72},(_,i)=>new Date(date+(hour-1+i)*3600000).toISOString().slice(0,16))};
  for(const [key,value] of Object.entries({temperature_2m:30,apparent_temperature:34,relative_humidity_2m:70,precipitation_probability:10,precipitation:0,rain:0,weather_code:2,cloud_cover:30,visibility:10000,wind_speed_10m:12,wind_direction_10m:90,wind_gusts_10m:20,pressure_msl:1010,uv_index:4})) hourly[key]=Array(72).fill(value);
  const daily={time:Array.from({length:8},(_,i)=>new Date(date+i*86400000).toISOString().slice(0,10))};
  for(const [key,value] of Object.entries({weather_code:2,temperature_2m_max:34,temperature_2m_min:24,apparent_temperature_max:38,apparent_temperature_min:26,precipitation_sum:0,rain_sum:0,precipitation_probability_max:10,uv_index_max:7,sunshine_duration:28000,daylight_duration:43200})) daily[key]=Array(8).fill(value);
  daily.sunrise=daily.time.map(day=>day+'T06:00');daily.sunset=daily.time.map(day=>day+'T18:00');
  return {timezone:city.timezone,utc_offset_seconds:-14400,current:{time:hourly.time[1],temperature_2m:30,apparent_temperature:34,relative_humidity_2m:70,precipitation:0,rain:0,showers:0,weather_code:2,cloud_cover:30,is_day:1,wind_speed_10m:12,wind_direction_10m:90,wind_gusts_10m:20,pressure_msl:1010},hourly,daily};
}
module.exports={forecast,city};
