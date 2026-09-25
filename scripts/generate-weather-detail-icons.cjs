// Ícones originais do PLUVIA para a temperatura do dia e os cards de detalhe.
// Run: node scripts/generate-weather-detail-icons.cjs
const fs = require('node:fs');
const path = require('node:path');

const folder = path.join(__dirname, '../dist/assets/weather-icons/metrics');
const defs = `<defs>
  <linearGradient id="hot" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffe58b"/><stop offset="1" stop-color="#ff824e"/></linearGradient>
  <linearGradient id="cool" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#c0f4ff"/><stop offset="1" stop-color="#478aff"/></linearGradient>
  <linearGradient id="glass" x1="0" y1="0" x2="1" y2="1"><stop stop-color="#ffffff"/><stop offset="1" stop-color="#d5eaff"/></linearGradient>
  <filter id="shade" x="-30%" y="-30%" width="160%" height="170%"><feGaussianBlur in="SourceAlpha" stdDeviation="2.5" result="blur"/><feOffset in="blur" dy="3" result="offset"/><feComponentTransfer in="offset" result="shadow"><feFuncA type="linear" slope=".22"/></feComponentTransfer><feMerge><feMergeNode in="shadow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
</defs>`;

const thermometer = (fill) => `<g filter="url(#shade)"><path d="M51 72V33a13 13 0 0 1 26 0v39a22 22 0 1 1-26 0Z" fill="url(#glass)" stroke="#8aadd9" stroke-width="2.5"/><path d="M64 38v48" stroke="${fill}" stroke-width="9" stroke-linecap="round"/><circle cx="64" cy="90" r="13" fill="${fill}"/><path d="M58 32v38" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".82"/></g>`;
const icons = {
  'temperature-high': `<circle cx="91" cy="34" r="21" fill="url(#hot)" opacity=".94"/><g stroke="#ffb95c" stroke-width="4" stroke-linecap="round"><path d="M91 5v7M91 56v7M62 34h7M113 34h7M71 14l5 5M106 49l5 5M111 14l-5 5"/></g>${thermometer('url(#hot)')}<path d="M91 91V71m0 0-9 9m9-9 9 9" fill="none" stroke="#ff9a59" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  'temperature-low': `<path d="M95 14a23 23 0 1 0 17 36 23 23 0 0 1-17-36Z" fill="url(#cool)" stroke="#c7ebff" stroke-width="2"/><circle cx="107" cy="14" r="2.5" fill="#b9dcff"/><path d="M114 38v8m-4-4h8" stroke="#b9dcff" stroke-width="2.5" stroke-linecap="round"/>${thermometer('url(#cool)')}<path d="M91 70v21m0 0-9-9m9 9 9-9" fill="none" stroke="#6daaff" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>`,
  'feels-like': `<circle cx="64" cy="64" r="51" fill="#8fbcff" opacity=".11"/><path d="M24 31c8-7 17-7 24 0M17 46c11-10 24-10 34-1M80 31c8-7 17-7 24 0M82 46c11-10 24-10 34-1" fill="none" stroke="#76b4fa" stroke-width="4" stroke-linecap="round" opacity=".9"/>${thermometer('url(#hot)')}<path d="M27 96c7 5 14 6 21 3M80 99c7 3 14 2 21-3" fill="none" stroke="#76b4fa" stroke-width="3" stroke-linecap="round"/>`,
  visibility: `<circle cx="64" cy="64" r="51" fill="#8fbcff" opacity=".10"/><path d="M12 64c13-21 32-32 52-32s39 11 52 32c-13 21-32 32-52 32S25 85 12 64Z" fill="url(#glass)" stroke="#79aef0" stroke-width="3" filter="url(#shade)"/><circle cx="64" cy="64" r="23" fill="url(#cool)" stroke="#bedfff" stroke-width="2"/><circle cx="64" cy="64" r="13" fill="#18365a"/><circle cx="57" cy="56" r="6" fill="#fff" opacity=".88"/><path d="M25 64c13-16 26-24 39-24" fill="none" stroke="#fff" stroke-width="3" stroke-linecap="round" opacity=".75"/>`
};

fs.mkdirSync(folder,{recursive:true});
for (const [name, drawing] of Object.entries(icons)) {
  fs.writeFileSync(path.join(folder,`${name}-pluvia.svg`),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128" role="img">${defs}<g>${drawing}</g></svg>\n`);
}
console.log(`Created ${Object.keys(icons).length} PLUVIA detail icons.`);
