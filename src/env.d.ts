// @dotrino/theme no publica tipos para su JS: aquí va lo que la trivia usa de él.
declare module '@dotrino/theme' {
  /** Vuelve a aplicar el tema que eligió el usuario (o el del sistema). */
  export function applyTheme (): void
}

// Asa para las pruebas de punta a punta (no afecta el uso normal).
interface Window {
  __trivia?: object
}
