// Mini-helper para construir DOM. El texto de usuario (preguntas, opciones) se
// inserta SIEMPRE como TextNode (createTextNode), nunca como HTML, para evitar
// inyección al abrir una trivia publicada por terceros. `html:` es sólo para
// nuestros propios SVG/íconos de confianza.
/** @typedef {Node | string | number | null | undefined | false} Kid */

/**
 * @template {keyof HTMLElementTagNameMap} K
 * @param {K} tag
 * @param {Record<string, any>} [props]  atributos, `class`, `style`, `html` y `on<evento>`: cada uno tiene su tipo
 * @param {...(Kid | Kid[])} kids
 * @returns {HTMLElementTagNameMap[K]}
 */
export function h(tag, props = {}, ...kids) {
  const e = document.createElement(tag);
  for (const k in props) {
    const v = props[k];
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(e.style, v);
    else if (k === 'html') e.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat()) {
    if (kid == null || kid === false) continue;
    e.append(typeof kid === 'object' && kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

/**
 * @template {Node} T
 * @param {T} node
 * @returns {T}
 */
export function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); return node; }
