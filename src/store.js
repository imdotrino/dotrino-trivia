// Persistencia OBLIGATORIA vía @dotrino/store (store.dotrino.com):
// la config de la trivia y los blobs de imágenes viven en el vault del ecosistema
// (IndexedDB, cuota grande, compartido entre apps del mismo navegador).
// Si el iframe del store no carga (offline / bloqueado), caemos a un shim sobre
// localStorage para no perder funcionalidad (la app debe andar sin conexión).

const THREAD_CFG = 'trivia.current';
const THREAD_ASSETS = 'trivia.assets';

let backendPromise = null;

// SIN REPLIEGUE SILENCIOSO (2026-09-30). Hasta ahora, si el almacén no abría, la partida se
// guardaba sin avisar en localStorage (`trivia.shim.<hilo>`) y no llegaba nunca a la bóveda.
// Ahora: la partida sigue EN MEMORIA y se DICE en pantalla (`onStoreProblem`), y lo que ya se
// había guardado por ese camino se trae al almacén una vez (`importShim`), sin borrarlo.
let problem = null;
const problemListeners = new Set();
/** Avisa (y avisa al suscribirse, si ya pasó) de que el almacén no abrió: no se guarda nada. */
export function onStoreProblem (fn) {
  problemListeners.add(fn);
  if (problem) fn(problem);
  return () => problemListeners.delete(fn);
}

function memoryBackend () {
  const mem = new Map();
  return {
    kind: 'memory',
    async appendMessage (t, e) { const a = mem.get(t) || []; a.push(e); mem.set(t, a); },
    async listThread (t) { return mem.get(t) || []; },
    async removeThread (t) { mem.delete(t); },
  };
}

const SHIM_PREFIX = 'trivia.shim.';
const SHIM_DONE = 'trivia.shim.imported';
/** Trae al almacén, UNA vez, lo que guardó el repliegue viejo; solo los hilos que el almacén no tiene. */
async function importShim (store) {
  let done = null;
  try { done = localStorage.getItem(SHIM_DONE); } catch { return; }
  if (done) return;
  const threads = {};
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(SHIM_PREFIX) || k === SHIM_DONE) continue;
    let arr = null;
    try { arr = JSON.parse(localStorage.getItem(k) || '[]'); } catch { arr = null; }
    if (Array.isArray(arr) && arr.length) threads[k.slice(SHIM_PREFIX.length)] = arr;
  }
  for (const t of Object.keys(threads)) {
    const ya = await store.listThread(t);
    if (ya.length) delete threads[t];   // lo del almacén es más nuevo que el repliegue
  }
  if (Object.keys(threads).length) await store.importThreads(threads, 'merge');
  localStorage.setItem(SHIM_DONE, String(Date.now()));
}

async function getBackend() {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    try {
      const mod = await import('@dotrino/store');
      const { getIdentity } = await import('./services/identity.js');
      const identity = await getIdentity();
      // Atado al PERFIL (respaldo en la bóveda, sin mezclar cuentas). Hasta 2026-09-30 conectaba
      // sin identidad y todo quedaba en el espacio común del navegador; `adoptCommon` lo trae al
      // perfil una vez, sin borrar el original.
      if (!identity) throw Object.assign(new Error('identity not available'), { code: 'no-identity' });
      const store = await mod.Store.connect({ identity, adoptCommon: ['trivia.'] });
      // Store.connect() devuelve el singleton aunque su iframe TODAVÍA no esté
      // listo, si otro consumidor de la misma app lo creó hace un instante (la
      // moneda de support también usa el store, para "recientes"). Quien pierde
      // esa carrera postearía su primer listThread a un iframe sin cargar: el
      // mensaje se pierde y la petición muere recién a los 8 s, retrasando el
      // arranque. ready() es idempotente (devuelve la misma promesa), así que
      // esperarlo aquí es gratis y nos garantiza un store utilizable.
      if (typeof store?.ready === 'function') await store.ready();
      // sanity-check de la API que usamos
      await importShim(store);
      if (store && typeof store.appendMessage === 'function' && typeof store.listThread === 'function') {
        return { kind: 'store', store,
          appendMessage: (t, e) => store.appendMessage(t, e),
          listThread: (t, o) => store.listThread(t, o),
          removeThread: t => store.removeThread(t) };
      }
      throw new Error('store API mismatch');
    } catch (e) {
      console.error('[trivia] store unavailable: this game is NOT being saved', e);
      problem = e;
      for (const fn of problemListeners) fn(e);
      return memoryBackend();
    }
  })();
  return backendPromise;
}

export async function storeKind() { return (await getBackend()).kind; }

// --- Config ---
export async function saveConfig(cfg) {
  const b = await getBackend();
  try { await b.removeThread(THREAD_CFG); } catch {}
  await b.appendMessage(THREAD_CFG, { id: 'cfg', ts: Date.now(), config: cfg });
}

export async function loadConfig() {
  const b = await getBackend();
  try {
    const entries = await b.listThread(THREAD_CFG, { limit: 1 });
    if (entries && entries.length) {
      const last = entries[entries.length - 1];
      if (last && last.config) return last.config;
    }
  } catch {}
  return null;
}

// --- Assets (imágenes) ---
const assetCache = new Map(); // ref → dataURI

function uid() {
  try { return crypto.randomUUID(); } catch { return 'a' + Date.now() + Math.random().toString(36).slice(2); }
}

// Guarda un data-URI como blob en el store; devuelve una ref 'store:<id>'.
export async function putAsset(dataUri) {
  const b = await getBackend();
  const id = uid();
  await b.appendMessage(THREAD_ASSETS, { id, ts: Date.now(), data: dataUri });
  const ref = 'store:' + id;
  assetCache.set(ref, dataUri);
  return ref;
}

// Resuelve una ref a algo usable en CSS/<img>: http(s)/data se devuelven tal cual;
// 'store:<id>' se busca en el store. Devuelve '' si no se encuentra.
export async function resolveAsset(ref) {
  if (!ref) return '';
  if (/^(https?:|data:)/i.test(ref)) return ref;
  if (assetCache.has(ref)) return assetCache.get(ref);
  if (ref.startsWith('store:')) {
    const id = ref.slice(6);
    const b = await getBackend();
    try {
      const entries = await b.listThread(THREAD_ASSETS, {});
      const found = (entries || []).find(e => e && e.id === id);
      if (found && found.data) { assetCache.set(ref, found.data); return found.data; }
    } catch {}
  }
  return '';
}

// Para construir el enlace de compartir: devuelve el data-URI embebible de una ref
// (http(s) se deja como URL — no se embebe; sólo store/data se materializan).
export async function materializeForShare(ref) {
  if (!ref) return '';
  if (/^https?:/i.test(ref)) return ref;          // URL: se comparte tal cual
  if (/^data:/i.test(ref)) return ref;            // data-URI: ya embebible
  if (ref.startsWith('store:')) return await resolveAsset(ref); // → data-URI local
  return '';
}

/** El almacén del ecosistema ya atado al perfil, para el punto del respaldo del topbar (null si no abrió). */
export async function storeHandle () {
  const b = await getBackend();
  if (b.kind !== 'store') return null;
  return (await import('@dotrino/store')).Store.current();
}
