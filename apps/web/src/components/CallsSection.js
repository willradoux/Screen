import { jsx as _jsx, jsxs as _jsxs } from "react/jsx-runtime";
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { EmptyState, Section } from './ui';
import { AvatarStack, CoverChip } from './Widget';
/**
 * Só as calls que têm gente agora. Call vazia não aparece (mesmo estando habilitada para live).
 * Sem nenhuma ativa, uma caixa simples avisa. Se não há calls configuradas, a seção some.
 *
 * `calls`: quem já buscou a lista passa aqui (evita buscar duas vezes); `null` = carregando.
 * Sem a prop, a seção busca sozinha.
 *
 * `shownRoomIds`: salas que a página já mostra em outro card (com os mesmos avatares). A call
 * dessas salas não se repete aqui; e, sem nada novo para mostrar, a seção some.
 */
export function CallsSection({ calls, shownRoomIds, }) {
    const own = useAsync(() => (calls === undefined ? api.calls.list() : Promise.resolve(calls ?? [])), [calls]);
    const list = calls === undefined ? (own.state.status === 'ready' ? own.state.data : null) : calls;
    if (!list || list.length === 0)
        return null;
    const withPeople = list.filter((c) => c.members.length > 0);
    const active = withPeople.filter((c) => !c.roomId || !shownRoomIds?.includes(c.roomId));
    if (shownRoomIds && active.length === 0)
        return null;
    return (_jsx(Section, { title: "Calls agora", count: active.length > 0 ? active.length : undefined, description: "Gente nos canais de voz do Discord.", children: active.length === 0 ? (_jsx(EmptyState, { title: "N\u00E3o tem call ativa.", children: "Quando algu\u00E9m entrar numa call habilitada, ela aparece aqui." })) : (_jsx("ul", { className: "widget-grid stagger", "aria-label": "Calls agora", children: active.map((call) => (_jsxs("li", { className: "sp-card", "data-testid": "call", children: [_jsxs("div", { className: "sp-cover", "data-tone": call.mediaState === 'IDLE' ? 'idle' : 'live', children: [_jsx("span", { className: "sp-cover-badge", children: _jsx(CoverChip, { icon: "mic", children: "Na call" }) }), _jsx(AvatarStack, { people: call.members, max: 4 })] }), _jsx("h3", { className: "sp-card-title", children: call.name }), _jsxs("p", { className: "sp-card-sub", children: [call.members.length, " ", call.members.length === 1 ? 'pessoa' : 'pessoas', " no canal de voz"] }), _jsx("div", { className: "sp-card-actions", children: call.roomId ? (_jsxs(Link, { to: `/r/${call.roomId}`, className: "btn btn-secondary btn-sm", children: ["Abrir a sala", call.mediaState === 'IDLE' ? ' (ativa a sessão)' : ''] })) : (_jsx("p", { className: "sp-card-note", children: "A sala abre em instantes." })) })] }, call.id))) })) }));
}
