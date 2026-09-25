// Original PLUVIA vector weather set. Run: node scripts/generate-weather-icons.cjs
const fs = require('node:fs');
const path = require('node:path');

const directory = path.join(__dirname, '../dist/assets/weather-icons/conditions');
const definitions = `<defs>
  <linearGradient id="sun" x1=".16" y1=".08" x2=".87" y2=".95" objectBoundingBox="true"><stop stop-color="#fff9c6"/><stop offset=".47" stop-color="#ffd662"/><stop offset="1" stop-color="#ff9f49"/></linearGradient>
  <linearGradient id="moon" x1=".13" y1=".08" x2=".9" y2=".9" objectBoundingBox="true"><stop stop-color="#fffdf2"/><stop offset=".57" stop-color="#d5eaff"/><stop offset="1" stop-color="#75aaff"/></linearGradient>
  <linearGradient id="cloud" x1=".2" y1=".03" x2=".88" y2="1" objectBoundingBox="true"><stop stop-color="#ffffff"/><stop offset=".55" stop-color="#d9eaff"/><stop offset="1" stop-color="#8ab8f0"/></linearGradient>
  <linearGradient id="darkCloud" x1=".18" y1=".05" x2=".85" y2="1" objectBoundingBox="true"><stop stop-color="#dfebff"/><stop offset=".55" stop-color="#8faed9"/><stop offset="1" stop-color="#5078b3"/></linearGradient>
  <linearGradient id="rain" x1="0" y1="0" x2="0" y2="1" objectBoundingBox="true"><stop stop-color="#92ebff"/><stop offset="1" stop-color="#398bff"/></linearGradient>
  <filter id="soft" x="-25%" y="-25%" width="150%" height="160%"><feGaussianBlur in="SourceAlpha" stdDeviation="2" result="blur"/><feOffset in="blur" dy="3" result="offset"/><feComponentTransfer in="offset" result="shade"><feFuncA type="linear" slope=".22"/></feComponentTransfer><feMerge><feMergeNode in="shade"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
  <mask id="crescent"><rect width="128" height="128" fill="white"/><circle cx="76" cy="38" r="24" fill="black"/></mask>
</defs>`;

const rays = `<g stroke="#ffc35f" stroke-width="4.5" stroke-linecap="round"><path d="M64 13v9M64 106v9M13 64h9M106 64h9M28 28l7 7M93 93l7 7M100 28l-7 7M35 93l-7 7"/></g>`;
const sun = `${rays}<circle cx="64" cy="64" r="26" fill="url(#sun)" stroke="#ffdc88" stroke-width="1.5" filter="url(#soft)"/><circle cx="57" cy="55" r="12" fill="#fff9df" opacity=".32"/>`;
const partialSun = `<g transform="translate(-23 -21) scale(.9)">${sun}</g>`;
const moon = `<g filter="url(#soft)"><circle cx="60" cy="55" r="30" fill="url(#moon)" mask="url(#crescent)"/><circle cx="60" cy="55" r="30" fill="none" stroke="#d5e8ff" stroke-width="1.5" mask="url(#crescent)"/></g><circle cx="99" cy="25" r="2" fill="#dceaff"/><path d="M107 43v8m-4-4h8" stroke="#dceaff" stroke-width="2" stroke-linecap="round"/>`;
const cloudShape = 'M27 96c-12 0-20-8-20-19 0-10 7-18 17-20 3-17 17-29 35-29 15 0 28 9 32 23 14-1 25 9 25 22 0 13-10 23-24 23H27z';
const cloud = (dark = false) => `<path d="${cloudShape}" fill="url(#${dark ? 'darkCloud' : 'cloud'})" stroke="${dark ? '#9bbcec' : '#f2f8ff'}" stroke-width="2" stroke-linejoin="round" filter="url(#soft)"/><path d="M24 64c4-16 17-26 35-26" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".48"/>`;
const backCloud = `<g transform="translate(29 -16) scale(.82)" opacity=".7">${cloud(true)}</g>`;
const drizzle = `<g stroke="url(#rain)" stroke-width="4.5" stroke-linecap="round"><path d="M42 104l-4 8M70 104l-4 8M96 104l-4 8"/></g>`;
const rain = `<g stroke="url(#rain)" stroke-width="5" stroke-linecap="round"><path d="M39 103l-5 11M66 103l-5 11M93 103l-5 11"/></g>`;
const strongRain = `${rain}<g stroke="url(#rain)" stroke-width="4" stroke-linecap="round"><path d="M52 106l-4 9M80 106l-4 9"/></g>`;
const lightning = `<path d="M70 94 53 114h15l-7 13 29-27H74l6-12Z" fill="#ffe46c" stroke="#fff4af" stroke-width="2" stroke-linejoin="round" filter="url(#soft)"/>`;
const snow = `<g stroke="#c4e9ff" stroke-width="3" stroke-linecap="round"><path d="M39 104v14m-7-7h14m-12-5 10 10m0-10-10 10M83 104v14m-7-7h14m-12-5 10 10m0-10-10 10"/></g><circle cx="61" cy="111" r="3" fill="#e6f9ff"/>`;
const hail = `<circle cx="39" cy="111" r="4" fill="#c8edff" stroke="#fff"/><circle cx="90" cy="110" r="4" fill="#c8edff" stroke="#fff"/>`;
const fog = `<g fill="none" stroke="#98c6ed" stroke-width="4.5" stroke-linecap="round"><path d="M18 101h67M37 112h74M14 122h60"/></g>`;
const symbols = {
  'clear-day':sun,
  'clear-night':moon,
  'partly-cloudy-day':`${partialSun}${cloud()}`,
  'partly-cloudy-night':`${moon}${cloud()}`,
  cloudy:`${backCloud}${cloud()}`,
  overcast:`${backCloud}${cloud(true)}`,
  fog:`${cloud()}${fog}`,
  haze:`${partialSun}${fog}`,
  'light-rain':`${cloud()}${drizzle}`,
  'moderate-rain':`${cloud(true)}${rain}`,
  'heavy-rain':`${cloud(true)}${strongRain}`,
  showers:`${partialSun}${cloud()}${rain}`,
  'showers-night':`${moon}${cloud()}${rain}`,
  thunderstorm:`${cloud(true)}${lightning}`,
  'thunderstorm-rain':`${cloud(true)}${rain}${lightning}`,
  'thunderstorm-hail':`${cloud(true)}${lightning}${hail}`,
  snow:`${cloud()}${snow}`,
};

fs.mkdirSync(directory, { recursive:true });
for (const [name, symbol] of Object.entries(symbols)) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img">${definitions}<g>${symbol}</g></svg>\n`;
  fs.writeFileSync(path.join(directory, `${name}.svg`), svg);
}
console.log(`Created ${Object.keys(symbols).length} PLUVIA weather icons.`);
