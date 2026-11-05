// La forma de los datos de la trivia: la configuración que se guarda y se comparte, y la
// partida en curso. Solo tipos (no hay código aquí).

/** Una pregunta ya normalizada (`normalizeQuestion`). */
export type Question =
  | { q: string, type: 'boolean', answer: boolean, explanation?: string }
  | { q: string, type: 'multiple', options: string[], answer: number, explanation?: string }

/** Aspecto de la trivia. `logo`/`bg*` son una URL, un data-URI o una ref `store:<id>`. */
export interface Theme {
  color: string
  mode: 'auto' | 'light' | 'dark' | string
  logo: string
  bgWeb: string
  bgMobile: string
}

/** La configuración de una trivia: lo que se edita, se guarda en el store y viaja en el #fragment. */
export interface Config {
  v: number
  title: string
  questionsText?: string
  questions: Question[]
  mode: 'quiz' | 'flashcards' | string
  count: number
  shuffleQuestions: boolean
  shuffleOptions: boolean
  showCorrect: boolean
  theme: Theme
}

/** El progreso de una partida guardado en localStorage. */
export interface PlayState {
  sig: string
  screen?: string
  i?: number
  score?: number
  session: Question[]
  [k: string]: unknown
}
