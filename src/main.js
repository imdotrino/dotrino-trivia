import './style.css';
import { h, clear } from './dom.js';
import { t, getLang, setLang } from './i18n.js';
import { defaultConfig, mergeConfig } from './state.js';
import { applyPalette } from './palette.js';
import { loadConfig, saveConfig, resolveAsset } from './store.js';
import { parseSharedConfig, buildShareLink } from './share.js';
import { renderEditor } from './editor.js';
import { renderPlay } from './play.js';
import { getUiMode, setUiMode } from './playstate.js';
import { createBackNav } from '@dotrino/nav';
// Botón "Instalar App" (PWA) unificado del ecosistema: Web Component que captura
// beforeinstallprompt temprano, maneja iOS con su propio modal (sin alert) y se
// auto-oculta si ya está instalada. Solo importar registra <dotrino-install>.
import '@dotrino/install';
// Moneda de support: en modo edición la trae el <dotrino-topbar>; en modo juego
// (pantalla completa, sin barra) la montamos nosotros flotando arriba a la
// derecha. Es el mismo componente y la misma versión: no hay dos copias.
import '@dotrino/support';
// Barra superior estándar del ecosistema (§5): marca + volver + acciones +
// idioma + perfil + moneda, todo en UN componente. La app no re-arma el header.
import '@dotrino/topbar';
// Identidad (§6.1): el topbar es dueño del modal "Mi perfil"; sólo hay que
// pasarle los pilares del ecosistema.
import { getIdentity } from './services/identity.js';
import { getReputation } from './services/reputation.js';

// Navegación "volver" unificada del ecosistema (registra <dotrino-back> y
// captura el botón físico de Android / gesto de iOS / atrás del navegador).
const nav = createBackNav();
// El JUEGO es el home; la EDICIÓN es una "capa" sobre él: en edición, volver
// (físico/chevron) regresa al juego. En el juego (sin capa) volver va a
// dotrino.com.
let editLayer = null;

const BRAND = 'Trivia';
const ICON_GEAR = '<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>';
const app = document.getElementById('app');

let cfg = defaultConfig();

// Tema del modal "Mi perfil" (vars --ccp-*). Se expresa con las variables de la
// paleta de la trivia (no con colores fijos): el usuario elige el color y el
// modo claro/oscuro, y el modal los sigue solo.
const PROFILE_THEME = {
  '--ccp-bg': 'var(--surface)', '--ccp-bg-2': 'var(--bg)',
  '--ccp-bg-3': 'var(--surface-2)', '--ccp-bg-4': 'var(--surface-2)',
  '--ccp-border': 'var(--border)', '--ccp-text': 'var(--text)', '--ccp-muted': 'var(--muted)',
  '--ccp-accent': 'var(--brand)', '--ccp-accent-2': 'var(--brand-2)',
  '--ccp-accent-text': 'var(--on-brand)',
  '--ccp-input-bg': 'var(--surface-2)', '--ccp-radius': 'var(--radius)',
};

// ---- shell ----
const bgLayer = h('div', { class: 'bg-layer' });
const view = h('main', { class: 'view' });
const toast = h('div', { class: 'toast' });

// Engrane: toggle a modo juego (mismo lugar que el de la pantalla de juego, que
// vuelve a edición). Va en el slot por defecto = acciones de la app.
const gearBtn = h('button', {
  class: 'btn btn-ghost icon-btn', 'data-testid': 'play-btn',
  onclick: () => showPlay({ published: false }), html: ICON_GEAR,
});
// Botón instalar: al slot 'end' (light DOM → lo estiliza el CSS de la app).
const installBtn = h('dotrino-install', { slot: 'end', class: 'cc-install sm', 'data-testid': 'install-btn' });

// Barra superior estándar (§5/§6/§6.1): trae volver, marca, idioma, perfil y la
// moneda de support. Se construye UNA sola vez y NO se re-renderiza (sus hijos
// viven en slots): re-crearla parpadearía y reinstalaría el "volver".
// La clase .topbar es sólo el gancho estable de los tests E2E.
const topbar = h('dotrino-topbar', {
  class: 'topbar',
  brand: BRAND,
  icon: 'icon.svg',
  'brand-href': './',
  profile: true,
  'support-href': 'https://ko-fi.com/dotrino',
  'support-repo': 'imdotrino/dotrino-trivia',
  'support-discord': 'https://discord.gg/D648uq7cth',
}, gearBtn, installBtn);
topbar.profileTheme = PROFILE_THEME;

// Moneda de support del modo juego: sin barra donde anclarla, flota arriba a la
// derecha (§6.1). Sólo está en el DOM mientras se juega.
const playCoin = h('dotrino-support', {
  floating: true,
  href: 'https://ko-fi.com/dotrino', repo: 'imdotrino/dotrino-trivia', discord: 'https://discord.gg/D648uq7cth',
});

clear(app).append(bgLayer, topbar, view, toast);

// ---- idioma ----
// El toggle ES/EN es el del topbar (fuente de verdad, persiste en
// 'dotrino.lang'). La app sólo lo sigue: sincroniza sus propios textos y los
// componentes del light DOM, que no heredan el idioma solos.
function syncLang() {
  const l = getLang();
  gearBtn.title = t('play');
  gearBtn.setAttribute('aria-label', t('play'));
  installBtn.setAttribute('lang', l);
  playCoin.setAttribute('lang', l);
}
syncLang();
topbar.addEventListener('dotrino-lang', (e) => {
  setLang(e.detail.lang);
  syncLang();
  // El toggle sólo se ve en la barra (modo edición): repintamos el editor con
  // los textos del idioma nuevo.
  if (!document.body.classList.contains('mode-play')) showEditor();
});

// ---- identidad (§6.1) ----
// El topbar abre "Mi perfil" él mismo; sólo hay que pasarle los pilares. Sin
// vault (offline/bloqueado) el botón queda inerte y la trivia funciona igual.
// Se cablea DESPUÉS del primer render (ver el final del archivo): el perfil es
// secundario y su iframe no debe competir con el store por el arranque.
async function wireIdentity() {
  const identity = await getIdentity();
  if (!identity) return;
  topbar.identity = identity;
  topbar.reputation = await getReputation();
}

// ---- tema (paleta + fondos) ----
async function applyTheme(c) {
  const brand = applyPalette(document.documentElement, c.theme.color, c.theme.mode);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', brand);
  document.documentElement.style.setProperty('color-scheme', c.theme.mode === 'light' ? 'light' : 'dark');

  const [web, mob] = await Promise.all([resolveAsset(c.theme.bgWeb), resolveAsset(c.theme.bgMobile)]);
  const css = v => v ? `url("${String(v).replace(/"/g, '\\"')}")` : 'none';
  document.documentElement.style.setProperty('--bg-web-img', css(web));
  document.documentElement.style.setProperty('--bg-mobile-img', css(mob || web));
}
async function resolvedLogo(c) { return await resolveAsset(c.theme.logo); }

function showToast(msg) {
  toast.textContent = msg; toast.classList.add('show');
  clearTimeout(showToast._t); showToast._t = setTimeout(() => toast.classList.remove('show'), 2600);
}

// ---- persistencia (debounced) ----
let saveTimer = null;
function commit() {
  applyTheme(cfg);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { saveConfig(cfg).catch(() => {}); }, 400);
}

// ---- vistas ----
function showEditor() {
  setUiMode('edit');
  document.body.classList.remove('mode-play');
  topbar.style.display = '';
  // En edición la moneda es la del topbar: la flotante sale del DOM.
  playCoin.remove();
  clear(view).append(renderEditor(cfg, commit));
  applyTheme(cfg);
  // La edición es una capa sobre el juego: volver (físico/chevron) regresa al
  // juego en vez de salir del sitio.
  if (!editLayer) editLayer = nav.open(() => showPlay({ published: false }));
}

async function showPlay({ published, playCfg }) {
  // Volver al juego cierra la capa de edición (si fue el botón físico, ya está
  // cerrada y esto es un no-op seguro).
  if (editLayer) { const l = editLayer; editLayer = null; l.close(); }
  const c = playCfg || cfg;
  if (!published) setUiMode('play');
  document.body.classList.add('mode-play');
  topbar.style.display = 'none';
  // Sin barra: la moneda flota arriba a la derecha.
  app.append(playCoin);
  await applyTheme(c);
  const images = { logo: await resolvedLogo(c) };
  clear(view).append(renderPlay(c, {
    published,
    images,
    brandName: BRAND,
    onExit: () => showEditor(),
  }));
  // Chevron de volver flotante arriba-izquierda: el juego es el home, así que
  // volver va a dotrino.com. En modo editable queda a la izquierda del engrane.
  view.append(h('dotrino-back', {
    floating: '', class: 'play-back', lang: getLang(),
    style: 'top:calc(env(safe-area-inset-top) + 12px);left:calc(env(safe-area-inset-left) + 12px);color:var(--text);--cc-back-size:42px;--cc-back-radius:11px;--cc-back-bg:color-mix(in srgb, var(--surface) 80%, transparent);--cc-back-bg-hover:color-mix(in srgb, var(--text) 10%, var(--surface))'
  }));
  if (!published) {
    // Engrane a la derecha del chevron → entrar al modo edición.
    view.append(h('button', { class: 'play-gear', title: t('edit'), 'aria-label': t('edit'), onclick: () => showEditor(), html: ICON_GEAR }));
  }
}

async function doPublish() {
  try {
    const { url, dropped } = await buildShareLink(cfg);
    try { await navigator.clipboard.writeText(url); } catch {}
    showToast(dropped ? t('linkDropped') : t('linkCopied'));
  } catch {}
  showPlay({ published: false });
}

// ---- PWA install ----
// El botón de instalar es el Web Component <dotrino-install> del ecosistema
// (va en el slot 'end' del topbar, ver el shell): captura beforeinstallprompt,
// maneja iOS y se auto-oculta. No hace falta lógica local.

// ---- boot ----
async function boot() {
  const shared = parseSharedConfig();
  if (shared) {
    cfg = mergeConfig(shared);
    await showPlay({ published: true, playCfg: cfg });
    return;
  }
  const saved = await loadConfig();
  if (saved) cfg = mergeConfig(saved);
  // Por defecto arranca en modo juego; un refresco respeta dónde estaba el
  // usuario (juego o edición).
  if (getUiMode() === 'edit') showEditor();
  else await showPlay({ published: false });
}
// El vault de identidad se conecta cuando la app YA está en pantalla: su iframe
// es trabajo de red que no debe retrasar el arranque (la trivia se juega igual
// sin él). `finally`: si el arranque falla, el perfil se cablea de todos modos.
boot().finally(() => { wireIdentity(); });

// Si el #fragment cambia en caliente (p. ej. pegan un enlace publicado en una
// pestaña ya abierta), entrar al modo limpio sin recargar.
window.addEventListener('hashchange', () => {
  const shared = parseSharedConfig();
  if (shared) { cfg = mergeConfig(shared); showPlay({ published: true, playCfg: cfg }); }
});

// ---- service worker ----
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => { navigator.serviceWorker.register('sw.js').catch(() => {}); });
}

// expuesto para tests E2E (no afecta el uso normal)
window.__trivia = { getConfig: () => cfg, parseSharedConfig, buildShareLink };
