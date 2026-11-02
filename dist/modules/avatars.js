/* Fotos de perfil: ilustrações de chuva (1.44, enviadas pelo dono em 02/11/2026, que pediu para trocar todas as
   anteriores), recortadas em círculo de 256 px por scripts/crop-avatars.py a partir de design/avatars/. A escolha
   sincroniza com a conta (user_metadata.avatar_id, só ids desta lista) e fica copiada em pluvia-avatars; não vai
   para a telemetria. Sem escolha, ou com um id antigo, a conta mostra a inicial. */
(function(root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else (root.PLUVIA = root.PLUVIA || {}).avatars = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function(root) {
  'use strict';
  const KEY = 'pluvia-avatars', MAX_ACCOUNTS = 5;
  const photo = name => `/assets/avatars/${name}.webp?v=avatars-1`;
  const AVATARS = Object.freeze([
    {id:'menina-capa-roxa', label:'Menina de capa roxa', src:photo('menina-capa-roxa')},
    {id:'cachorro-capa', label:'Cachorro de capa amarela', src:photo('cachorro-capa')},
    {id:'sol-arco-iris', label:'Sol, nuvem e arco-íris', src:photo('sol-arco-iris')},
    {id:'menino-barquinho', label:'Menino com barquinho de papel', src:photo('menino-barquinho')},
    {id:'gato-capa', label:'Gato de capa azul', src:photo('gato-capa')},
    {id:'vovo-guarda-chuva', label:'Vovó de guarda-chuva', src:photo('vovo-guarda-chuva')},
    {id:'menina-capa-amarela', label:'Menina de capa amarela', src:photo('menina-capa-amarela')},
    {id:'nuvenzinha', label:'Nuvenzinha de chuva', src:photo('nuvenzinha')},
    {id:'menino-cachecol', label:'Menino de cachecol', src:photo('menino-cachecol')},
    {id:'sapo', label:'Sapo de chapéu de folha', src:photo('sapo')},
    {id:'menina-guarda-chuva', label:'Menina de guarda-chuva', src:photo('menina-guarda-chuva')},
    {id:'menino-caneca', label:'Menino com caneca', src:photo('menino-caneca')}
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
  // Pinta um elemento como foto (decorativa; o nome acessível fica no botão).
  // lazy: as opções de "Minha conta" ficam numa janela fechada; com loading=lazy (antes do src) elas só baixam
  // quando a janela abre, em vez de disputar a rede com a previsão na abertura (1.25).
  function paint(node, avatar, documentRef = root.document, {lazy = false} = {}) {
    if (!node) return;
    if (!avatar) { delete node.dataset?.avatar; return; }
    node.dataset.avatar = avatar.id;
    const image = documentRef.createElement('img');
    if (lazy) image.loading = 'lazy';
    image.src = avatar.src; image.alt = ''; image.width = 128; image.height = 128; image.decoding = 'async';
    node.replaceChildren(image);
  }
  return {KEY, AVATARS, find, get, set, paint};
});
