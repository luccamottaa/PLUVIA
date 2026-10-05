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
const wind=line('M17 52h65c19 0 19-27 3-27-8 0-12 5-12 10M17 68h85c18 0 18 25 2 25-8 0-11-4-11-9M28 85h29c16 0 16 23 1 23','#8bdaf1',5);
const drop='<path d="M64 17c-8 13-32 40-32 59a32 32 0 0 0 64 0c0-19-24-46-32-59Z" fill="url(#water)" stroke="#9ce9fb" stroke-width="2.5"/>'+line('M46 77c0 10 6 17 15 18','#d3f6ff',4);
const thermometer=(color='#71cdf4')=>'<path d="M52 74V29a12 12 0 0 1 24 0v45a24 24 0 1 1-24 0Z" fill="#dcefff" stroke="#96bdd9" stroke-width="3"/>'+line('M64 40v43',color,7)+circle(64,94,13,color);
const arrow=(up=true)=>line(up?'M97 63V30m-10 11 10-11 10 11':'M97 27v33m-10-11 10 11 10-11',up?'#ffbf69':'#81d9ef',5);
const eye='<path d="M12 64s19-28 52-28 52 28 52 28-19 28-52 28S12 64 12 64Z" fill="#d7eafb" stroke="#8ebee3" stroke-width="3"/>'+circle(64,64,17,'#4ea9df')+circle(64,64,8,'#173e66')+circle(69,59,3,'#f5fbff');
const leaf='<path d="M27 85C19 42 49 23 98 24 100 73 72 100 35 92" fill="#79d8be" stroke="#b3edd8" stroke-width="3"/>'+line('M29 102 77 49M47 83l-1-20M59 71h20','#247c7a',4);
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
const icons={conditions:conditionArtwork,metrics:{
 temperature:thermometer(),'feels-like':group(thermometer(),'translate(-10 0)')+line('M87 46c12 5-10 14 2 19m9-28c12 5-10 14 2 19','#f4c17b',4),'temperature-high':group(thermometer('#ffbb70'),'translate(-13 0)')+arrow(),'temperature-low':group(thermometer(),'translate(-13 0)')+arrow(false),humidity:drop,'dew-point':group(drop,'translate(29 20) scale(.73)')+group(thermometer(),'translate(-4 1) scale(.58)'),pressure:circle(64,65,42,'#d9edfc','#9cbedb',3)+line('M34 64a30 30 0 0 1 60 0M64 64l18-19','#418dbb',5)+circle(64,64,5,'#214d73')+line('M47 87h34','#418dbb',4),visibility:eye,'wind-speed':wind,'wind-gust':wind+line('M18 35h26','#d4eff9',4),'wind-direction':circle(64,64,43,'none','#8ac9eb',3)+'<path d="m64 28 24 61-24-12-24 12Z" fill="#75d8ed" stroke="#c5f0fa" stroke-width="3" stroke-linejoin="round"/>','cloud-cover':cloud(),'uv-index':sun+'<path d="m82 68 26 9v17c0 12-13 21-26 26-13-5-26-14-26-26V77Z" fill="#3c95cf" stroke="#b5e5fb" stroke-width="3"/>'+line('M73 93l7 7 14-16','#e5f8ff',4),'air-quality':leaf,'rain-probability':drop,'rain-volume':group(drop,'translate(-9 -6) scale(.75)')+line('M80 25v80h26M80 39h12M80 55h18M80 71h12M80 87h18','#b4ddf3',4)
},astronomy:{sunrise:sunrise(),sunset:sunrise(true),daylight:sun},maps:{radar:circle(64,64,43,'none','#79cdec',3)+circle(64,64,26,'none','#79cdec',3)+line('M64 21v43l30-30M21 64h86M64 64v43','#79cdec',3)+circle(49,77,5,'#80dec3'),satellite:group('<rect x="48" y="42" width="32" height="44" rx="6" fill="#d5eafb"/>'+line('M19 44h22v40H19ZM87 44h22v40H87ZM64 29v13M64 86v15','#79cdec',4),'rotate(-30 64 64)'),lightning:group(bolt,'translate(-13 -60) scale(1.3)')},fallback:{'weather-unknown':cloud()+circle(64,68,14,'#3478ad')+line('M61 62c0-5 10-5 10 0 0 4-7 4-7 8M64 77h.1','#eefaff',3)}};
for(const [category,items] of Object.entries(icons)){
 fs.mkdirSync(path.join(root,category),{recursive:true});
 for(const [name,body] of Object.entries(items)) {
  const gradients=category==='conditions' ? '<defs>'+[...new Set([...body.matchAll(/url\(#([^\)]+)\)/g)].map(match=>match[1]))].map(id=>conditionGradients[id]).join('')+'</defs>' : defs;
  fs.writeFileSync(path.join(root,category,name+'.svg'),`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="128" height="128">${gradients}${body}</svg>\n`);
 }
}
const catalog=Object.fromEntries(Object.entries(icons).map(([cat,items])=>[cat,Object.fromEntries(Object.keys(items).map(name=>[name,name+'.svg']))]));
fs.writeFileSync(path.join(root,'catalog.json'),JSON.stringify(catalog,null,2)+'\n');
console.log(`${Object.values(icons).reduce((n,v)=>n+Object.keys(v).length,0)} original SVG icons generated.`);
