// Identidad = vault id.dotrino.com (@dotrino/identity), única fuente de la
// identidad y la firma del ecosistema. No reimplementamos nada: sólo cacheamos
// la conexión para no abrir dos iframes.
//
// La trivia funciona igual sin vault (es una herramienta local): si no conecta,
// el botón de perfil queda inerte y todo lo demás sigue andando.
import { Identity } from '@dotrino/identity';

/** @type {Identity | null} */
let identity = null;

/**
 * La identidad del vault, conectada una vez. `null` si el vault no responde.
 * @returns {Promise<Identity | null>}
 */
export async function getIdentity() {
  if (identity) return identity;
  try {
    identity = await Identity.connect();
  } catch (e) {
    console.warn('[trivia] vault unreachable:', /** @type {Error} */ (e)?.message || e);
    identity = null;
  }
  return identity;
}

/** @returns {string | null} */
export function myPubkey() { return identity?.me?.publickey || null; }
