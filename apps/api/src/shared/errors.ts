/** Erro de aplicação com código estável. Catálogo: docs/backend/erros.md */
export class AppError extends Error {
  constructor(
    public readonly code: string,
    public readonly status: number,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const notFound = (message = 'Recurso não encontrado.') =>
  new AppError('NOT_FOUND', 404, message);
export const unauthenticated = () =>
  new AppError('UNAUTHENTICATED', 401, 'Faça login para continuar.');
export const forbidden = (message = 'Você não tem permissão para isso.') =>
  new AppError('FORBIDDEN', 403, message);
