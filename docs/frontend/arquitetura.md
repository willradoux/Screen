# Arquitetura do site (`apps/web/src`)

O código fica separado **por funcionalidade**: tudo o que é de uma parte do produto (tela, componentes, regras de interface e testes) mora junto. O que várias partes usam fica em `shared/`. O `app/` junta tudo.

```
src/
  main.tsx          entrada (o index.html aponta para cá)
  app/              o site montado: rotas, layout (menu lateral), guardas de login, abertura,
                    fundo e os testes que montam o site inteiro
  features/
    auth/           login e sessão (AuthProvider, LoginPage)
    rooms/          lista de salas: início, cartão da sala, calls do Discord
    meetings/       página de reuniões
    call/           a chamada: RoomPage, palco, controles, chat, pessoas, sessão (LiveKit + socket)
      lib/          o que só a chamada usa: mídia, efeitos de voz e vídeo, áudio, sala grande
    admin/          painel, gerenciar reuniões, pessoas, configurações, estatísticas, auditoria
    landing/        a página de apresentação (/sobre): a TV, o cenário, os temas e a música
    guide/          o Guia (/guia) e a página pública /features
    preferences/    preferências
  shared/
    ui/             componentes que qualquer parte usa (ui.tsx, Icon, Sheet, logo...)
      fluid/        peças da Fluid (ícones que se transformam, pílulas com mola)
    lib/            api, tipos, formatos, tema, cor da pessoa, sons, regras de moderação
  styles/           index.css, v3.css e premium.css (o visual por camadas)
  test/             setup e helpers dos testes
  dev/              laboratório do palco (só em desenvolvimento)
```

## Regras das camadas

O lint (`eslint.config.js`) recusa o import que quebra essas regras:

| Quem | Pode importar | Não pode |
|---|---|---|
| `shared/` | só `shared/` (e pacotes) | `features/`, `app/` |
| `features/x` | `shared/` e outras funcionalidades quando é de verdade o mesmo assunto (ex.: a sala usa o selo de estado do cartão de sala) | `app/` |
| `app/` | tudo | nada |

- Uma coisa que duas funcionalidades usam vai para `shared/`.
- Teste que monta telas de várias partes juntas fica em `app/`; o resto fica ao lado do arquivo que testa.
- Contratos do layout que a sala usa (`useImmersive`) e o evento de pular a abertura (`SKIP_INTRO_EVENT`) ficam em `shared/lib/`, para nenhuma funcionalidade depender do `app/`.

## Onde colocar algo novo

- Tela nova de uma parte que já existe: na pasta dela em `features/`.
- Parte nova do produto: uma pasta nova em `features/` e a rota em `app/App.tsx`.
- Componente que serve para mais de uma parte: `shared/ui/`. Função ou tipo: `shared/lib/`.
- Peça nova da Fluid: copie do repositório da Fluid para `shared/ui/fluid/` e troque as cores pelas do Screen.
