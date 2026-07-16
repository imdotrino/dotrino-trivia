// Identidad = vault id.dotrino.com (@dotrino/identity), única fuente de la
// identidad y la firma del ecosistema. No reimplementamos nada: sólo cacheamos
// la conexión para no abrir dos iframes.
//
// La trivia funciona igual sin vault (es una herramienta local): si no conecta,
// el botón de perfil queda inerte y todo lo demás sigue andando.
import { Identity } from '@dotrino/identity';

let identity = null;

export async function getIdentity() {
  if (identity) return identity;
  try {
    identity = await Identity.connect();
  } catch (e) {
    console.warn('[trivia] vault inalcanzable:', e?.message || e);
    identity = null;
  }
  return identity;
}

export function myPubkey() { return identity?.me?.publickey || null; }
