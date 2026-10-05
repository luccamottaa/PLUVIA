// Original PLUVIA icon family. Regenerate with node scripts/generate-modern-weather-icons.cjs.
const fs=require('node:fs'),path=require('node:path');
const root=path.join(__dirname,'../dist/assets/weather-icons');
const defs='<defs><linearGradient id="cloud" x2="0.3" y2="1"><stop stop-color="#f4fbff"/><stop offset="1" stop-color="#adcfee"/></linearGradient><linearGradient id="sun" x2=".7" y2="1"><stop stop-color="#ffe694"/><stop offset="1" stop-color="#ffb64c"/></linearGradient><linearGradient id="water" x2=".4" y2="1"><stop stop-color="#7ce3f5"/><stop offset="1" stop-color="#3697ef"/></linearGradient><linearGradient id="moon" x2=".6" y2="1"><stop stop-color="#f0f5ff"/><stop offset="1" stop-color="#a9bde8"/></linearGradient></defs>';
const line=(d,c='#8dc7ed',w=5)=>`<path d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
const circle=(x,y,r,fill,stroke='none',w=2)=>`<circle cx="${x}" cy="${y}" r="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${w}"/>`;
const group=(s,t)=>`<g transform="${t}">${s}</g>`;
const sun=line('M64 14v9M64 105v9M14 64h9M105 64h9M29 29l6 6M93 93l6 6M99 29l-6 6M35 93l-6 6','#ffc85e',5)+circle(64,64,28,'url(#sun)','#ffdf8c',2);
const cloud=(dark=false)=>`<path d="M33 86C20 86 12 78 12 67s8-19 19-20c4-17 17-26 32-24 15 1 25 11 28 24 14-1 25 8 25 20 0 11-9 19-22 19Z" fill="${dark?'#8faecc':'url(#cloud)'}" stroke="${dark?'#b2cde3':'#e6f5ff'}" stroke-width="2.5" stroke-linejoin="round"/>`;
const bolt='<path d="m65 72-19 25h16l-7 22 31-33H69l7-14Z" fill="#ffcb60" stroke="#ffe29d" stroke-width="2.5" stroke-linejoin="round"/>';
const sunrise=(set=false)=>group(sun,'translate(13 10) scale(.8)')+'<path d="M10 83h108v38H10Z" fill="none"/>'+line('M17 90h94M28 103h72','#93c9e9',5)+line(set?'M64 83V58m-9 16 9 9 9-9':'M64 58v25m-9-16 9-9 9 9','#173e66',4);

// Condition artwork is independent of the small instrument/map symbols below.
// Volume comes from static gradients, not filters, blur, raster images or animation.
const conditionGradients={
 'sky-cloud':'<radialGradient id="sky-cloud" cx=".34" cy=".15" r=".92"><stop stop-color="#ffffff"/><stop offset=".42" stop-color="#eef6fc"/><stop offset=".78" stop-color="#b9cfdf"/><stop offset="1" stop-color="#8ca7c0"/></radialGradient>',
 'sky-cloud-dark':'<radialGradient id="sky-cloud-dark" cx=".34" cy=".15" r=".92"><stop stop-color="#d8e6f0"/><stop offset=".42" stop-color="#b9cbdc"/><stop offset=".78" stop-color="#7d97b3"/><stop offset="1" stop-color="#536f91"/></radialGradient>',
 'sky-highlight':'<radialGradient id="sky-highlight"><stop stop-color="#ffffff" stop-opacity=".7"/><stop offset="1" stop-color="#ffffff" stop-opacity="0"/></radialGradient>',
 'sky-sun':'<radialGradient id="sky-sun" cx=".32" cy=".26" r=".78"><stop stop-color="#fff3b0"/><stop offset=".42" stop-color="#ffda65"/><stop offset=".8" stop-color="#ffb32f"/><stop offset="1" stop-color="#f98b20"/></radialGradient>',
 'sky-moon':'<radialGradient id="sky-moon" cx=".28" cy=".25" r=".85"><stop stop-color="#ffffff"/><stop offset=".52" stop-color="#e1eafb"/><stop offset="1" stop-color="#9eb5dc"/></radialGradient>',
 'sky-rain':'<linearGradient id="sky-rain" x2=".45" y2="1"><stop stop-color="#88e5ff"/><stop offset=".48" stop-color="#4ab9f7"/><stop offset="1" stop-color="#2f6bff"/></linearGradient>',
 'sky-bolt':'<linearGradient id="sky-bolt" x2=".5" y2="1"><stop stop-color="#fff3b0"/><stop offset=".45" stop-color="#ffd04b"/><stop offset="1" stop-color="#ff9b23"/></linearGradient>'
};
const softCloud=(dark=false)=>`<g data-symbol="cloud"><path d="M31 91C17 91 7 83 7 71c0-11 8-20 19-22 3-16 16-27 33-27 18 0 32 12 34 28 15-1 28 9 28 22 0 11-10 19-24 19Z" fill="url(#${dark?'sky-cloud-dark':'sky-cloud'})" stroke="${dark?'#b4c7db':'#e5f1fa'}" stroke-width=".8"/><ellipse cx="53" cy="48" rx="26" ry="22" fill="url(#sky-highlight)" opacity=".55"/><ellipse cx="30" cy="66" rx="16" ry="17" fill="url(#sky-highlight)" opacity=".45"/></g>`;
const softSun=`<g data-symbol="sun">${line('M64 13v10M64 105v10M13 64h10M105 64h10M28 28l7 7M93 93l7 7M100 28l-7 7M35 93l-7 7','#ffd067',4)}${circle(64,64,28,'url(#sky-sun)')}<path d="M43 59a22 22 0 0 1 22-17" fill="none" stroke="#fff6c0" stroke-width="2" stroke-linecap="round" opacity=".65"/></g>`;
const softMoon='<g data-symbol="moon"><path d="M78 20C57 23 46 42 49 61c3 21 22 35 43 33A39 39 0 1 1 78 20Z" fill="url(#sky-moon)"/><ellipse cx="39" cy="69" rx="4" ry="6" fill="#859fc2" opacity=".22"/><circle cx="47" cy="86" r="3" fill="#859fc2" opacity=".18"/><path d="m96 28 2 6 6 2-6 2-2 6-2-6-6-2 6-2Z" fill="#dfeaff"/><circle cx="109" cy="63" r="2.3" fill="#c7daf7"/></g>';
const softPartial=(night=false,few=false)=>group(night?softMoon:softSun,'translate(-5 -5) scale(.78)')+group(softCloud(),few?'translate(49 48) scale(.55)':'translate(15 31) scale(.85)');
const rainCloud=(dark=false)=>group(softCloud(dark),'translate(7 -1) scale(.9)');
const softDrops=(count=3,drizzle=false)=>`<g data-symbol="${drizzle?'drizzle':'rain'}">`+Array.from({length:count},(_,i)=>{
 const x=34+i*60/Math.max(1,count-1),y=drizzle?101:93;
 return group('<path d="M5 0C4 5 0 12 0 16a5 5 0 0 0 10 0C10 12 6 5 5 0Z" fill="url(#sky-rain)"/>',`translate(${x-5} ${y}) rotate(18 5 10)${drizzle?' scale(.7)':''}`);
}).join('')+'</g>';
const softBolt='<g data-symbol="lightning"><path d="M65 74 46 99h16l-7 23 31-35H70l7-13Z" fill="url(#sky-bolt)" stroke="#ffe7a0" stroke-width="1" stroke-linejoin="round"/></g>';
const softFlakes=`<g data-symbol="snow">${line('M37 95v22M28 100l18 12M46 100l-18 12M90 95v22M81 100l18 12M99 100l-18 12','#bde9ff',3.5)}</g>`;
const weatherStroke=(d,color='#b8d2e6')=>line(d,'#57769a',6)+line(d,color,3.5);
const softWind=weatherStroke('M13 49h66c18 0 19-25 4-25-8 0-12 5-12 10M13 66h87c18 0 18 26 2 26-8 0-12-5-12-10M26 84h28c18 0 18 24 2 24','#83d3f6');
const conditionArtwork={
 'clear-day':softSun,'clear-night':softMoon,
 'few-clouds-day':softPartial(false,true),'few-clouds-night':softPartial(true,true),
 'partly-cloudy-day':softPartial(),'partly-cloudy-night':softPartial(true),
 cloudy:softCloud(),overcast:group(softCloud(true),'translate(29 -5) scale(.73)')+group(softCloud(),'translate(-1 26) scale(.87)'),
 drizzle:rainCloud()+softDrops(3,true),'light-rain':rainCloud()+softDrops(2),
 'moderate-rain':rainCloud()+softDrops(3),'heavy-rain':rainCloud(true)+softDrops(5),
 showers:group(softSun,'translate(-1 0) scale(.62)')+group(softCloud(),'translate(15 19) scale(.82)')+softDrops(3),
 'showers-night':group(softMoon,'translate(-1 -7) scale(.68)')+group(softCloud(),'translate(15 19) scale(.82)')+softDrops(3),
 thunderstorm:rainCloud(true)+softBolt,'thunderstorm-rain':rainCloud(true)+softDrops(2)+softBolt,
 'thunderstorm-hail':rainCloud(true)+`<g data-symbol="hail">${circle(32,107,4.5,'#e4f3ff','#a4c9ee',1)}${circle(96,107,4.5,'#e4f3ff','#a4c9ee',1)}</g>`+softBolt,
 snow:rainCloud()+softFlakes,sleet:rainCloud()+softDrops(1)+group(softFlakes,'translate(47 0) scale(.52 1)'),
 fog:group(softCloud(),'translate(13 -4) scale(.82)')+weatherStroke('M16 86h77M35 101h77M20 115h60'),
 haze:group(softSun,'translate(13 -4) scale(.78)')+weatherStroke('M18 80h91M30 95h67M18 110h91','#cad5de'),windy:softWind
};
const metricGradients={
 ...conditionGradients,
 'instrument-face':'<linearGradient id="instrument-face" x2=".35" y2="1"><stop stop-color="#ffffff"/><stop offset=".45" stop-color="#e9f3fd"/><stop offset="1" stop-color="#a7bfd9"/></linearGradient>',
 'instrument-blue':'<radialGradient id="instrument-blue" cx=".32" cy=".23" r=".85"><stop stop-color="#9ce6ff"/><stop offset=".45" stop-color="#50b4ef"/><stop offset="1" stop-color="#2f6bff"/></radialGradient>',
 'instrument-warm':'<radialGradient id="instrument-warm" cx=".3" cy=".2" r=".85"><stop stop-color="#ffe7a4"/><stop offset=".45" stop-color="#ffbd55"/><stop offset="1" stop-color="#f18b32"/></radialGradient>',
 'instrument-leaf':'<radialGradient id="instrument-leaf" cx=".3" cy=".2" r=".9"><stop stop-color="#d3f8de"/><stop offset=".5" stop-color="#78d9aa"/><stop offset="1" stop-color="#249b7c"/></radialGradient>'
};
const softThermometer=(warm=false)=>'<path d="M49 75V28a15 15 0 0 1 30 0v47a25 25 0 1 1-30 0Z" fill="url(#instrument-face)" stroke="#6484a7" stroke-width="2.5"/>'+line('M64 31v54',warm?'#f7a749':'#3d9fe9',8)+circle(64,96,15,`url(#${warm?'instrument-warm':'instrument-blue'})`)+line('M56 28v41','#ffffff',2)+line('M82 36h7M82 50h7M82 64h7','#6484a7',3);
const temperatureArrow=(up=true)=>group('<path d="m101 18 13 16h-8v28H96V34h-8Z" fill="url(#'+(up?'instrument-warm':'instrument-blue')+')" stroke="'+(up?'#ab722f':'#3c689f')+'" stroke-width="1.5" stroke-linejoin="round"/>',up?'translate(0 0)':'translate(0 81) scale(1 -1)');
const softDrop='<path d="M64 15C54 32 29 58 29 78a35 35 0 0 0 70 0C99 58 74 32 64 15Z" fill="url(#sky-rain)" stroke="#3976ac" stroke-width="1.5"/>'+line('M44 77c0 12 7 21 17 24','#d7f4ff',3.5);
const instrumentWind= line('M13 49h66c18 0 19-25 4-25-8 0-12 5-12 10M13 66h87c18 0 18 26 2 26-8 0-12-5-12-10M26 84h28c18 0 18 24 2 24','#57769a',8)+line('M13 49h66c18 0 19-25 4-25-8 0-12 5-12 10M13 66h87c18 0 18 26 2 26-8 0-12-5-12-10M26 84h28c18 0 18 24 2 24','#87d6fa',5);
const softEye='<path d="M10 64s20-28 54-28 54 28 54 28-20 28-54 28S10 64 10 64Z" fill="url(#instrument-face)" stroke="#6083aa" stroke-width="2.5"/>'+circle(64,64,20,'url(#instrument-blue)','#4382b7',1.5)+circle(64,64,9,'#24416a')+circle(71,56,4,'#ffffff');
const softLeaf='<path d="M27 88C17 47 50 22 104 22c0 51-27 80-69 73Z" fill="url(#instrument-leaf)" stroke="#3d927c" stroke-width="2"/>'+line('M28 111 85 42M47 86l-1-23M61 69h24','#297e68',3.5);
const metricArtwork={
 temperature:softThermometer(),
 'feels-like':group(softThermometer(true),'translate(-12 0)')+line('M94 37c13 8-12 15 1 23M107 46c13 8-12 15 1 23','#b97a37',5)+line('M94 37c13 8-12 15 1 23M107 46c13 8-12 15 1 23','#ffd083',2.5),
 'temperature-high':group(softThermometer(true),'translate(-14 0)')+temperatureArrow(),
 'temperature-low':group(softThermometer(),'translate(-14 0)')+temperatureArrow(false),
 humidity:softDrop,'dew-point':group(softDrop,'translate(36 25) scale(.68)')+group(softThermometer(),'translate(2 3) scale(.59)'),
 pressure:circle(64,66,43,'url(#instrument-face)','#6484a7',2.5)+line('M35 64a29 29 0 0 1 58 0M40 47l5 5M64 35v8M88 47l-5 5','#6484a7',3.5)+line('M64 67 83 48','#2f6bff',5)+circle(64,67,5,'#37698f')+line('M47 88h34','#6484a7',4),
 visibility:softEye,'wind-speed':instrumentWind,'wind-gust':instrumentWind+weatherStroke('M18 32h26','#c3e8fb'),
 'wind-direction':circle(64,64,44,'url(#instrument-face)','#6484a7',2.5)+'<path d="m64 28 24 61-24-12-24 12Z" fill="url(#instrument-blue)" stroke="#4a7ca7" stroke-width="2" stroke-linejoin="round"/>',
 'cloud-cover':softCloud(),'uv-index':group(softSun,'translate(12 8) scale(.8)')+'<path d="m83 63 28 10v19c0 14-14 23-28 29-14-6-28-15-28-29V73Z" fill="url(#instrument-blue)" stroke="#477cab" stroke-width="2"/>'+line('M71 92l8 8 16-18','#ffffff',4.5),
 'air-quality':softLeaf,'rain-probability':softDrop,
 'rain-volume':group(softDrop,'translate(-4 3) scale(.73)')+line('M87 27v81h27M87 42h13M87 57h19M87 73h13M87 89h19','#57769a',6)+line('M87 27v81h27M87 42h13M87 57h19M87 73h13M87 89h19','#b9ddf1',3)
};
const icons={conditions:conditionArtwork,metrics:metricArtwork,astronomy:{sunrise:sunrise(),sunset:sunrise(true),daylight:sun},maps:{radar:circle(64,64,43,'none','#79cdec',3)+circle(64,64,26,'none','#79cdec',3)+line('M64 21v43l30-30M21 64h86M64 64v43','#79cdec',3)+circle(49,77,5,'#80dec3'),satellite:group('<rect x="48" y="42" width="32" height="44" rx="6" fill="#d5eafb"/>'+line('M19 44h22v40H19ZM87 44h22v40H87ZM64 29v13M64 86v15','#79cdec',4),'rotate(-30 64 64)'),lightning:group(bolt,'translate(-13 -60) scale(1.3)')},fallback:{'weather-unknown':cloud()+circle(64,68,14,'#3478ad')+line('M61 62c0-5 10-5 10 0 0 4-7 4-7 8M64 77h.1','#eefaff',3)}};
for(const [category,items] of Object.entries(icons)){
 fs.mkdirSync(path.join(root,category),{recursive:true});
 for(const [name,body] of Object.entries(items)) {
  const gradients=['conditions','metrics'].includes(category) ? '<defs>'+[...new Set([...body.matchAll(/url\(#([^\)]+)\)/g)].map(match=>match[1]))].map(id=>metricGradients[id]).join('')+'</defs>' : defs;
  fs.writeFileSync(path.join(root,category,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${gradients}${body}</svg>\n`);
 }
}
const catalog=Object.fromEntries(Object.entries(icons).map(([cat,items])=>[cat,Object.fromEntries(Object.keys(items).map(name=>[name,name+'.svg']))]));
fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(`${Object.values(icons).reduce((n,v)=>n+Object.keys(v).length,0)} original SVG icons generated.`);
