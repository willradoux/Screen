# Backlog proposto

Estas são sugestões de issues. Nenhuma foi aberta e nenhum responsável foi atribuído. Os IDs abaixo são referências locais, não números de issues GitHub.

| ID | Entrega | Dependências | Critério de conclusão |
|---|---|---|---|
| P01 | Validar RFC e decisões | — | Decisões registradas com justificativa e pendências explícitas |
| P02 | Inventariar VPS e DNS | — | Recursos, serviços e portas conhecidos; topologia escolhida |
| P03 | Preparar aplicação Discord de teste | D03/D07 | Guild, cargos e permissões mínimos documentados |
| P04 | Inicializar monorepo e CI | P01 | Web/API/bot com comandos reproduzíveis e checks passando |
| P05 | Provar mídia e TURN | P02/P04 | Chamada entre redes distintas, tela legível e fallback testado |
| P06 | Implementar OAuth e autorização | P03/P04 | Não membro e usuário sem cargo impedidos de acessar |
| P07 | Implementar salas e convites | P06 | Convites expirados/revogados e acesso por sala verificados |
| P08 | Implementar comandos do bot | P03/P07 | Fluxo completo e retries sem duplicar salas |
| P09 | Implementar papéis e admissão | P05/P07 | Última vaga concorrente e publicação não autorizada bloqueadas |
| P10 | Validar expulsão/reentrada | P09 | Testes com tokens originais/renovados e política aprovada |
| P11 | Preparar deploy e recuperação | P02/P04 | Backup restaurado, alerta externo e rollback ensaiados |
| P12 | Executar piloto e medir carga | P08/P10/P11 | Relatório de capacidade, qualidade, falhas e custo |
| P13 | Ampliar capacidade | P12 | Novo perfil homologado antes de elevar limites |

## Primeira rodada de colaboração

Começar por P01, P02 e P03. Depois de resolver as dependências, dividir código em entregas pequenas. Não implementar várias alternativas de infraestrutura ao mesmo tempo.

## Como abrir cada issue

Usar o modelo de tarefa, vincular decisão/RFC e incluir comportamento esperado, teste e dependências. Substituir referências Pxx por links reais à medida que as issues forem criadas.

