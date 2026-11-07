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
- [ ] A divisão entre mídia WebRTC e eventos Socket.IO/LiveKit está justificada?
- [ ] A topologia cabe na VPS e não conflita com serviços existentes?
- [ ] Os limites globais evitam sobrecarga por várias salas?
- [ ] A política de revogação é aceitável e verificável?
- [ ] Há responsável por incidentes e alternativa para eventos?
- [ ] Backup, restauração e atualização têm critérios de teste?
- [ ] As metas de capacidade estão identificadas como hipóteses?
- [ ] O primeiro conjunto de tarefas pode ser executado pela equipe?

## Forma de feedback

Referencie Dxx, Pxx ou a seção da RFC. Descreva problema, alternativa e impacto. Não é necessário concordar com toda a proposta: registrar divergências ajuda a escolher.

## Discussão principal

Registrar o resultado da revisão na [issue P01](https://github.com/willradoux/aceleraScreem/issues/1). O [backlog](backlog.md) reúne as tarefas abertas e propostas.

## PR de organização

Título: docs: organizar escopo, arquitetura e revisão do Acelera Screen

Descrição: Organiza a proposta inicial em escopo, RFC, registro de decisões, preparação do ambiente e backlog. Inclui modelos de issue/PR e arquivos básicos de colaboração. Não inicializa aplicação nem altera a VPS.

Validação: estrutura dos arquivos e links relativos verificados. Não há aplicação ou infraestrutura executável para testar nesta etapa.

