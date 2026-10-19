/* Fotos de perfil: desenhos de tempo do próprio app (assets/weather-icons/conditions, já no precache)
   sobre um círculo colorido. A escolha fica só neste aparelho, por conta (id do Supabase), em
   pluvia-avatars; não vai para o servidor nem para a telemetria. Sem escolha, a conta mostra a inicial. */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).avatars = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  const KEY = 'pluvia-avatars', MAX_ACCOUNTS = 5;
  const icon = name => `/assets/weather-icons/conditions/${name}.svg?v=modern-3`;
  const AVATARS = Object.freeze([
    {id:'sol', label:'Sol', src:icon('clear-day'), bg:'linear-gradient(145deg,#ffe08a,#ffb648)'},
    {id:'lua', label:'Lua', src:icon('clear-night'), bg:'linear-gradient(145deg,#3150a8,#101f4a)'},
    {id:'nuvem', label:'Sol entre nuvens', src:icon('partly-cloudy-day'), bg:'linear-gradient(145deg,#a9d8ff,#5aa2f5)'},
    {id:'chuva', label:'Chuva', src:icon('moderate-rain'), bg:'linear-gradient(145deg,#8fa9c8,#4c6688)'},
    {id:'trovoada', label:'Trovoada', src:icon('thunderstorm'), bg:'linear-gradient(145deg,#7d6bb8,#352a66)'},
    {id:'neve', label:'Neve', src:icon('snow'), bg:'linear-gradient(145deg,#f1f7ff,#c3dbf4)'},
    {id:'vento', label:'Vento', src:icon('windy'), bg:'linear-gradient(145deg,#b6f0d6,#4cc79a)'},
    {id:'neblina', label:'Neblina', src:icon('fog'), bg:'linear-gradient(145deg,#dde3ea,#a3b0c0)'},
    {id:'noite-nublada', label:'Noite com nuvens', src:icon('partly-cloudy-night'), bg:'linear-gradient(145deg,#4a3f8f,#1a1640)'},
    {id:'garoa', label:'Garoa', src:icon('drizzle'), bg:'linear-gradient(145deg,#c9e6f2,#7fb4cf)'},
    {id:'temporal', label:'Chuva forte', src:icon('heavy-rain'), bg:'linear-gradient(145deg,#5f7fa8,#22364f)'},
    {id:'granizo', label:'Granizo', src:icon('thunderstorm-hail'), bg:'linear-gradient(145deg,#9fb4d6,#46557a)'},
    {id:'nublado', label:'Nublado', src:icon('overcast'), bg:'linear-gradient(145deg,#cfd8e3,#8494a8)'},
    {id:'pancada', label:'Pancada de chuva', src:icon('showers'), bg:'linear-gradient(145deg,#ffd9a0,#f08a5d)'},
    {id:'bruma', label:'Bruma', src:icon('haze'), bg:'linear-gradient(145deg,#f6e3c4,#d9a86c)'},
    {id:'chuva-noite', label:'Chuva à noite', src:icon('showers-night'), bg:'linear-gradient(145deg,#2c4f7c,#0d1b33)'},
    {id:'poucas-nuvens', label:'Poucas nuvens', src:icon('few-clouds-day'), bg:'linear-gradient(145deg,#ffe6f0,#ff9fc4)'},
    {id:'raio-chuva', label:'Trovoada com chuva', src:icon('thunderstorm-rain'), bg:'linear-gradient(145deg,#2b2140,#7a3fd1)'}
  ].map(Object.freeze));
  const find = id => AVATARS.find(avatar => avatar.id === id) || null;
  function read(storage) {
    try {
      const value = JSON.parse(storage?.getItem?.(KEY) || '{}');
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch { return {}; }
  }
  function get(userId, storage = root.localStorage) {
    return userId ? find(read(storage)[userId]) : null;
  }
  // Escolher de novo move a conta para o fim; só as últimas contas deste aparelho ficam guardadas.
  function set(userId, id, storage = root.localStorage) {
    if (!userId || (id && !find(id))) return false;
    const map = read(storage);
    delete map[userId];
    if (id) map[userId] = id;
    const kept = Object.entries(map).filter(([, value]) => find(value)).slice(-MAX_ACCOUNTS);
    try { storage.setItem(KEY, JSON.stringify(Object.fromEntries(kept))); return true; } catch { return false; }
  }
  // Pinta um elemento como foto: fundo colorido e o desenho (decorativo; o nome acessível fica no botão).
  function paint(node, avatar, documentRef = root.document) {
    if (!node) return;
    if (!avatar) { node.style?.removeProperty?.('--avatar-bg'); delete node.dataset?.avatar; return; }
    node.dataset.avatar = avatar.id;
    node.style.setProperty('--avatar-bg', avatar.bg);
    const image = documentRef.createElement('img');
    image.src = avatar.src; image.alt = ''; image.width = 64; image.height = 64; image.decoding = 'async';
    node.replaceChildren(image);
  }
  return {KEY, AVATARS, find, get, set, paint};
});
