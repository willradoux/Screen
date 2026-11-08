import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';
import type { ApiErrorBody } from '@screem/shared';
import { AppError } from './errors.js';

interface HttpLikeError {
  status?: number;
  type?: string;
}

/** Converte qualquer erro no formato padrão (docs/backend/erros.md). */
export const errorHandler: ErrorRequestHandler = (err, req, res, _next) => {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Erro interno. Tente novamente.';
  let details: unknown;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err instanceof ZodError) {
    status = 400;
    code = 'VALIDATION_ERROR';
    message = 'Dados inválidos.';
    details = {
      fields: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    };
  } else {
    const http = err as HttpLikeError;
    if (http.type === 'entity.parse.failed') {
      status = 400;
      code = 'INVALID_JSON';
      message = 'O corpo da requisição não é um JSON válido.';
    } else if (http.type === 'entity.too.large') {
      status = 413;
      code = 'PAYLOAD_TOO_LARGE';
      message = 'O corpo da requisição é grande demais.';
    } else {
      req.log.error({ err }, 'erro inesperado');
    }
  }

  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
      requestId: String(req.id),
    },
  };
  res.status(status).json(body);
};
