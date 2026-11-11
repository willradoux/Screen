/** Formatação de datas e tempos no fuso do navegador. */
const dateTime = new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
});
export function formatDateTime(iso) {
    if (!iso)
        return '—';
    const d = new Date(iso);
    return Number.isNaN(d.getTime()) ? '—' : dateTime.format(d);
}
/** "2 h 05 min", "12 min", "45 s". Para contagens regressivas. */
export function formatDuration(ms) {
    const total = Math.max(0, Math.floor(ms / 1000));
    const days = Math.floor(total / 86_400);
    const hours = Math.floor((total % 86_400) / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const seconds = total % 60;
    if (days > 0)
        return `${days} d ${hours} h`;
    if (hours > 0)
        return `${hours} h ${String(minutes).padStart(2, '0')} min`;
    if (minutes > 0)
        return `${minutes} min`;
    return `${seconds} s`;
}
/** Tempo que falta até `iso`. Passou: `null`. */
export function timeUntil(iso, now = Date.now()) {
    if (!iso)
        return null;
    const diff = new Date(iso).getTime() - now;
    return Number.isNaN(diff) || diff <= 0 ? null : diff;
}
/**
 * Valor de um `<input type="datetime-local">` ("2026-12-05T20:00", sem fuso, no relógio do
 * navegador) para ISO 8601 em UTC. `null` se vazio ou inválido.
 */
export function localInputToIso(value) {
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value))
        return null;
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
/** O inverso: ISO (UTC) para o valor de um `datetime-local` no relógio do navegador. */
export function isoToLocalInput(iso) {
    if (!iso)
        return '';
    const d = new Date(iso);
    if (Number.isNaN(d.getTime()))
        return '';
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
/** Lembretes em minutos para um texto curto: 1440 -> "24 h", 60 -> "1 h", 5 -> "5 min". */
export function formatReminder(minutes) {
    if (minutes % 1440 === 0)
        return `${minutes / 1440} d`;
    if (minutes % 60 === 0)
        return `${minutes / 60} h`;
    return `${minutes} min`;
}
/** Só caminhos relativos do próprio site (evita redirect aberto). */
export function safeRedirect(value) {
    if (!value)
        return '/';
    if (!value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\'))
        return '/';
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f\\]/.test(value))
        return '/';
    return value;
}
export function initials(name) {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0)
        return '?';
    const first = parts[0][0] ?? '?';
    const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
    return (first + last).toUpperCase();
}
