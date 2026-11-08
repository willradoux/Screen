/**
 * Aceita apenas caminhos relativos ao próprio frontend. Qualquer outra coisa
 * vira "/". Evita open redirect no fim do login.
 */
export function sanitizeRedirect(input: string | undefined | null): string {
  if (!input) return '/';
  if (input.length > 500) return '/';
  // Precisa começar com uma única "/" (nem "//" nem "/\", que o navegador trata como host).
  if (!input.startsWith('/') || input.startsWith('//') || input.startsWith('/\\')) return '/';
  // Sem caracteres de controle nem barra invertida.
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(input)) return '/';
  try {
    const base = 'http://base.invalid';
    if (new URL(input, base).origin !== base) return '/';
  } catch {
    return '/';
  }
  return input;
}
