# Roteiro de revisão da equipe

## Objetivo

Validar a proposta do Acelera Screen antes de implementar a aplicação e configurar produção.

## Leitura sugerida

1. [Escopo](escopo.md).
2. [Decisões](decisoes.md).
3. Seções da [RFC](rfcs/0001-arquitetura-operacao.md) relacionadas à sua contribuição.
4. [Ambiente](ambiente.md) e [backlog](backlog.md).

## Pontos para revisar

- [ ] A jornada inicial atende aos encontros da comunidade?
- [ ] Quem pode entrar, criar e moderar está claro?
- [ ] As permissões do bot são suficientes e mínimas?
- [ ] A topologia cabe na VPS e não conflita com serviços existentes?
- [ ] Os limites globais evitam sobrecarga por várias salas?
- [ ] A política de revogação é aceitável e verificável?
- [ ] Há responsável por incidentes e alternativa para eventos?
- [ ] Backup, restauração e atualização têm critérios de teste?
- [ ] As metas de capacidade estão identificadas como hipóteses?
- [ ] O primeiro conjunto de tarefas pode ser executado pela equipe?

## Forma de feedback

Referencie Dxx, Pxx ou a seção da RFC. Descreva problema, alternativa e impacto. Não é necessário concordar com toda a proposta: registrar divergências ajuda a escolher.

## Texto sugerido para a primeira issue

Título: Validar escopo, arquitetura e ambiente inicial do Acelera Screen

O Acelera Screen pretende oferecer salas privadas com áudio, câmera e tela para membros do AceleraDev, integradas ao Discord. Precisamos validar o escopo do piloto, permissões, topologia na KVM1 e critérios de segurança/continuidade antes de implementar.

Os documentos em docs/ reúnem a proposta e decisões abertas. A meta de 500 participantes depende de testes e dimensionamento; o primeiro piloto será controlado. React e TypeScript/Express são as escolhas de partida.

Resultado esperado: decisões registradas, inventário do ambiente e primeiras tarefas prontas para implementação. Revisar os pontos deste documento e vincular o feedback às decisões correspondentes.

## PR de organização proposto

Título: docs: organizar escopo, arquitetura e revisão do Acelera Screen

Descrição: Organiza a proposta inicial em escopo, RFC, registro de decisões, preparação do ambiente e backlog. Inclui modelos de issue/PR e arquivos básicos de colaboração. Não inicializa aplicação nem altera a VPS.

Validação: estrutura dos arquivos e links relativos verificados. Não há aplicação ou infraestrutura executável para testar nesta etapa.

