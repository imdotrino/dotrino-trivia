// Modelo de configuración de la trivia + normalización/validación del JSON.

/** @returns {import('./model').Config} */
export function defaultConfig() {
  return {
    v: 1,
    title: '',
    questionsText: '',
    questions: [],
    mode: 'quiz',            // 'quiz' (puntaje) | 'flashcards'
    count: 0,               // 0 = todas
    shuffleQuestions: true,
    shuffleOptions: false,
    showCorrect: true,
    theme: { color: '#00658c', mode: 'auto', logo: '', bgWeb: '', bgMobile: '' },
  };
}

/**
 * @param {any} saved  lo guardado o lo que llegó en un enlace, sin comprobar
 * @returns {import('./model').Config}
 */
export function mergeConfig(saved) {
  const d = defaultConfig();
  if (!saved || typeof saved !== 'object') return d;
  return {
    ...d, ...saved,
    theme: { ...d.theme, ...(saved.theme || {}) },
    questions: Array.isArray(saved.questions) ? saved.questions : d.questions,
  };
}

/** @param {Record<string, unknown>} raw */
function expl(raw) {
  const e = String(raw.explanation ?? raw.explain ?? raw.exp ?? '').trim();
  return e || undefined;
}

const TRUE_WORDS = ['true', 't', 'verdadero', 'v', 'yes', 'si', 'sí', '1'];

// Normaliza una pregunta heterogénea a {q, type, options?, answer, explanation?}.
// Devuelve null si no es válida (se descarta sin romper el resto).
/**
 * @param {any} raw  una pregunta tal como venga en el JSON pegado
 * @returns {import('./model').Question | null}
 */
export function normalizeQuestion(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const q = String(raw.q ?? raw.question ?? raw.text ?? '').trim();
  if (!q) return null;

  let type = String(raw.type ?? '').trim().toLowerCase();
  let options = Array.isArray(raw.options) ? raw.options.map((/** @type {unknown} */ o) => String(o))
    : Array.isArray(raw.answers) ? raw.answers.map((/** @type {unknown} */ o) => String(o)) : null;
  const answer = raw.answer ?? raw.correct ?? raw.correctAnswer ?? raw.correctIndex;

  if (!type) type = (options && options.length >= 2) ? 'multiple' : 'boolean';

  if (type === 'boolean' || type === 'truefalse' || type === 'tf' || type === 'bool') {
    let b;
    if (typeof answer === 'boolean') b = answer;
    else b = TRUE_WORDS.includes(String(answer).trim().toLowerCase());
    return { q, type: 'boolean', answer: !!b, explanation: expl(raw) };
  }

  // multiple
  if (!options || options.length < 2) return null;
  let idx;
  if (typeof answer === 'number') idx = answer;
  else if (typeof answer === 'boolean') return null;
  else idx = options.findIndex((/** @type {string} */ o) => o.trim().toLowerCase() === String(answer).trim().toLowerCase());
  if (!Number.isInteger(idx) || idx < 0 || idx >= options.length) return null;
  return { q, type: 'multiple', options, answer: idx, explanation: expl(raw) };
}

// Acepta un array de preguntas o un objeto { title?, questions: [...] }.
// Lanza Error con mensaje legible si el JSON no parsea o la forma es inválida.
/**
 * @param {unknown} text
 * @returns {{ title: string, questions: import('./model').Question[] }}
 */
export function parseQuestionsInput(text) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return { title: '', questions: [] };
  let data;
  try { data = JSON.parse(trimmed); }
  catch (e) { throw new Error(/** @type {Error} */ (e).message); }

  let title = '';
  /** @type {unknown[]} */
  let list;
  if (Array.isArray(data)) list = data;
  else if (data && typeof data === 'object' && Array.isArray(data.questions)) {
    list = data.questions;
    title = String(data.title ?? '').trim();
  } else {
    throw new Error('Expected an array of questions or { "questions": [...] }.');
  }

  const questions = /** @type {import('./model').Question[]} */ (list.map(normalizeQuestion).filter(Boolean));
  return { title, questions };
}

// Construye una sesión de juego (orden + opciones barajadas según config).
/**
 * @template T
 * @param {T[]} arr
 * @returns {T[]}
 */
function shuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/**
 * @param {import('./model').Config} cfg
 * @returns {import('./model').Question[]}
 */
export function buildSession(cfg) {
  let pool = (cfg.questions || []).slice();
  if (cfg.shuffleQuestions) pool = shuffle(pool);
  if (cfg.count && cfg.count > 0) pool = pool.slice(0, cfg.count);

  return pool.map(qq => {
    if (qq.type === 'multiple' && cfg.shuffleOptions) {
      const order = shuffle(qq.options.map((_, i) => i));
      return {
        ...qq,
        options: order.map(i => qq.options[i]),
        answer: order.indexOf(qq.answer),
      };
    }
    return { ...qq };
  });
}
