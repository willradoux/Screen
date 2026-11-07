# Contribuindo com o Acelera Screen

## Neste momento

Estamos validando escopo, arquitetura e operação. Comece por [decisões pendentes](docs/decisoes.md). Diferencie uma proposta de uma decisão aprovada e uma funcionalidade planejada de algo implementado.

Para sugerir uma mudança, descreva:
- Qual problema ela resolve.
- Alternativas consideradas.
- Impacto na VPS, segurança, manutenção e experiência.
- Como verificar se a solução funciona.

## Fluxo proposto

1. Discutir a decisão ou tarefa em issue.
2. Criar branch com mudança pequena e foco definido.
3. Abrir PR explicando comportamento e validação.
4. Solicitar revisão e resolver pendências.
5. Registrar decisões aceitas com data e link da discussão.

Não atribuímos responsáveis nem prazos sem acordo. Proteção de branch, checks e política de merge ainda precisam ser configurados conforme o plano e as permissões do repositório.

## Segredos e produção

Não incluir tokens, cookies, senhas, chaves privadas, dumps, dados de membros ou detalhes administrativos em commits e issues. O arquivo .env.example contém somente campos propostos. Ambientes e aplicações Discord de teste e produção serão separados.

Para uma falha de segurança, avisar os mantenedores por canal privado acordado. O canal e os responsáveis precisam ser definidos antes do piloto.

## Validação

Documentação: verificar links relativos, coerência e distinção entre hipóteses e fatos. Aplicação: os comandos oficiais de instalação, testes e build serão documentados quando a base for criada. Ainda não existe npm install ou docker compose up funcional neste repositório.

