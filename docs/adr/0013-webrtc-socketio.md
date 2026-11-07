# D13 — WebRTC e Socket.IO

Estado: proposta, pendente de validação da equipe.
Origem: sugestão do colaborador Flazo, trazida por Will em 07/11/2026 por captura de tela. Não representa aprovação ou escolha final do colaborador.

## Problema

Precisamos transportar áudio, câmera e tela, além de sincronizar pedidos para falar, estado de sala e ações de moderação. A escolha deve caber no orçamento operacional e evitar duas fontes divergentes de estado.

## Responsabilidades

| Tecnologia | Papel proposto |
|---|---|
| WebRTC | Transporte de mídia em tempo real entre clientes e infraestrutura de mídia |
| LiveKit | Implementação de SFU, sinalização e SDKs sobre WebRTC; opção de infraestrutura do piloto |
| Socket.IO | Opção para eventos de aplicação entre navegador e API Express |
| PostgreSQL | Estado durável de regras, decisões, reservas e auditoria |

WebRTC já faz parte da arquitetura proposta com LiveKit. Adotar LiveKit não exige implementar uma segunda sinalização de mídia em Socket.IO. WebRTC + Socket.IO sem um servidor de mídia apropriado não elimina o problema de distribuir transmissões para um público grande.

Não encaminhar quadros de vídeo, áudio ou imagens da tela pela API Express/Socket.IO. A mídia deve usar o transporte especializado. LiveKit usa seus próprios SDKs e sinalização; um cliente Socket.IO não se conecta diretamente a esse canal.

## Alternativas para validar

| Opção | Benefício | Custo/limite |
|---|---|---|
| REST para comandos e recursos LiveKit para estado dentro da sala | Menos componentes e conexões adicionais | Precisa de mecanismo separado para notificações fora da sala |
| REST + Socket.IO para eventos da aplicação; LiveKit para mídia | Eventos em lobby e sala com semântica própria | Mais conexões, regras de autorização e tratamento de recuperação |
| WebRTC com SFU e sinalização próprios | Controle fino da implementação | Maior esforço e risco operacional para este piloto |

Proposta inicial: manter LiveKit para mídia e provar se há necessidade real de Socket.IO no controle da aplicação. Se adotado, pode rodar junto ao servidor HTTP Express; não exige um novo microserviço.

## Contrato de eventos candidato

| Evento | Direção | Validação obrigatória |
|---|---|---|
| room.snapshot | Servidor → cliente | Estado atual filtrado pela autorização |
| speaker.requested | Cliente → servidor | Identidade, elegibilidade, frequência e sala |
| participant.role.changed | Servidor → cliente | Emitir após alteração autorizada no backend |
| room.closed | Servidor → cliente | Estado persistido; cliente reconcilia |
| room.capacity.changed | Servidor → cliente | Versão e acesso à sala |

Nomes são candidatos, não endpoints implementados. Decidir se comandos de moderação ficam apenas em REST para evitar duas entradas com regras distintas.

## Segurança e consistência

- Autenticar o handshake com a sessão e validar a origem.
- Autorizar cada assinatura/evento por sala e usuário; o cliente não escolhe um canal privado arbitrário.
- Validar payload, tamanho e frequência.
- Não usar socket.id como identidade permanente.
- Alteração de cargo, banimento e expiração da sessão exigem revalidação/desconexão apropriada.
- Não tratar uma notificação como autorização de mídia: a mudança precisa ser aplicada no LiveKit pelo backend.
- Comandos duráveis com identificador, confirmação e idempotência; estado persistido antes da notificação.
- Após reconexão, consultar snapshot autoritativo e versão. A recuperação automática pode falhar.
- Filas e buffers limitados; descartar eventos transitórios obsoletos.
- Com múltiplas instâncias no futuro, estudar adaptador, afinidade de sessão e compatibilidade de recuperação antes de escalar.
- Dados sensíveis e credenciais não devem aparecer nos eventos de broadcast.

Socket.IO não persiste mensagens por padrão e sua entrega padrão é no máximo uma vez; reconexão não garante que todos os eventos perdidos sejam reproduzidos. LiveKit também possui mecanismos de dados e estado, que devem ser avaliados antes de duplicar essa função.

## Ensaio para decidir

1. Demonstrar pedido para falar, mudança de papel e encerramento.
2. Testar reconexão e cliente entrando depois do evento.
3. Tentar receber eventos de outra sala e enviar alteração de papel indevida.
4. Medir consumo extra e comportamento com bot/API temporariamente indisponíveis.
5. Documentar o caminho de recuperação, limitações e resultado D13.

Saída: escolha justificada, contrato mínimo e evidência de testes. Nenhuma garantia de alta disponibilidade decorre apenas de escolher Socket.IO.

## Fontes

- https://socket.io/docs/v4/
- https://socket.io/docs/v4/faq/
- https://socket.io/docs/v4/how-it-works/
- https://socket.io/docs/v4/client-socket-instance/
- https://docs.livekit.io/transport/data/
- https://docs.livekit.io/transport/data/state/
