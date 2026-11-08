import type { RequestHandler, Response } from 'express';
import type { ZodTypeAny, z } from 'zod';

interface Schemas {
  body?: ZodTypeAny;
  query?: ZodTypeAny;
  params?: ZodTypeAny;
}

type Infer<T extends ZodTypeAny | undefined> = T extends ZodTypeAny ? z.infer<T> : undefined;

export interface Validated<S extends Schemas> {
  body: Infer<S['body']>;
  query: Infer<S['query']>;
  params: Infer<S['params']>;
}

/**
 * Valida body, query e params com zod. Em caso de erro, o ZodError é tratado
 * pelo middleware final (VALIDATION_ERROR, 400). Os dados já tipados ficam em
 * `res.locals.validated` (use `getValidated`). No Express 5 `req.query` é
 * somente leitura, por isso não sobrescrevemos o request.
 */
export function validate<S extends Schemas>(schemas: S): RequestHandler {
  return (req, res, next) => {
    try {
      res.locals.validated = {
        body: schemas.body?.parse(req.body),
        query: schemas.query?.parse(req.query),
        params: schemas.params?.parse(req.params),
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function getValidated<S extends Schemas>(res: Response, _schemas?: S): Validated<S> {
  return res.locals.validated as Validated<S>;
}
