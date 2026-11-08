import { Router, type NextFunction, type Request, type Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { buildOpenApi } from '../../openapi.js';

/**
 * Documentação interativa. A CSP global da API é "default-src 'none'", então
 * esta rota define uma CSP própria, mais permissiva, só para o Swagger UI.
 */
export function docsRoutes(publicApiUrl: string): Router {
  const router = Router();
  const spec = buildOpenApi(publicApiUrl);

  router.get('/openapi.json', (_req, res) => {
    res.json(spec);
  });

  router.use(
    '/docs',
    (_req: Request, res: Response, next: NextFunction) => {
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
      );
      next();
    },
    swaggerUi.serve,
    swaggerUi.setup(spec, { customSiteTitle: 'Screem API' }),
  );

  return router;
}
