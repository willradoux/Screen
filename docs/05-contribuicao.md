# 05 - Contribuição

## Fluxo

1. Crie uma branch a partir da `main`: `feat/nome`, `fix/nome`, `docs/nome`.
2. Faça commits pequenos no padrão **Conventional Commits** (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).
3. Abra PR com descrição, como testar e links da documentação atualizada.
4. CI deve passar. Pelo menos uma revisão.

## Regra de documentação

Mudou API, evento, modelo, variável de ambiente ou permissão? **Atualize o doc correspondente no mesmo PR.** PR que altera o contrato sem alterar a doc é recusado.

## Padrões de código

- TypeScript em modo `strict`.
- Validação de entrada com zod em todas as bordas (REST, Socket.IO, comandos do bot).
- Sem `any` sem justificativa em comentário.
- Funções pequenas, nomes em inglês, comentários e docs em português.
- Erros usam as classes de [erros.md](backend/erros.md), nunca strings soltas.
- Logs estruturados (pino). Nunca logar tokens, cookies ou segredos.

## Testes

- Unitários com Vitest; integração com Supertest e MongoDB em memória/container.
- Veja [backend/testes.md](backend/testes.md).

## Segredos

Nunca commitar `.env`. Use `.env.example` com valores fictícios.
