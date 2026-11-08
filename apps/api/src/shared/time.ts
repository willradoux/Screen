/**
 * Datas no fuso do servidor Discord (padrão America/Sao_Paulo), sem dependências.
 * Tudo é armazenado em UTC; o fuso só é usado para interpretar o que o admin digita.
 */

interface Parts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

/** Componentes de relógio de `date` no fuso `timeZone`. */
export function zonedParts(date: Date, timeZone: string): Parts & { second: number } {
  const map: Record<string, number> = {};
  for (const p of formatter(timeZone).formatToParts(date)) {
    if (p.type !== 'literal') map[p.type] = Number(p.value);
  }
  return {
    year: map.year!,
    month: map.month!,
    day: map.day!,
    hour: map.hour!,
    minute: map.minute!,
    second: map.second!,
  };
}

function offsetMs(date: Date, timeZone: string): number {
  const p = zonedParts(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/**
 * Converte um horário de relógio no fuso dado para o instante UTC.
 * Devolve `null` para datas inexistentes (31/02) ou horários que não existem
 * no fuso (início do horário de verão).
 */
export function zonedTimeToUtc(parts: Parts, timeZone: string): Date | null {
  const { year, month, day, hour, minute } = parts;
  const check = new Date(Date.UTC(year, month - 1, day, hour, minute));
  if (
    check.getUTCFullYear() !== year ||
    check.getUTCMonth() !== month - 1 ||
    check.getUTCDate() !== day ||
    check.getUTCHours() !== hour ||
    check.getUTCMinutes() !== minute
  ) {
    return null;
  }

  const guess = check.getTime();
  let t = guess - offsetMs(new Date(guess), timeZone);
  t = guess - offsetMs(new Date(t), timeZone);
  const result = new Date(t);

  // Confere se o relógio local realmente bate (descarta horários "pulados").
  const back = zonedParts(result, timeZone);
  if (back.hour !== hour || back.minute !== minute || back.day !== day) return null;
  return result;
}

/** Interpreta `DD/MM/AAAA` e `HH:mm` no fuso dado. `null` se o formato ou a data forem inválidos. */
export function parseDateTime(date: string, time: string, timeZone: string): Date | null {
  const d = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  const t = /^(\d{1,2}):(\d{2})$/.exec(time.trim());
  if (!d || !t) return null;
  return zonedTimeToUtc(
    {
      year: Number(d[3]),
      month: Number(d[2]),
      day: Number(d[1]),
      hour: Number(t[1]),
      minute: Number(t[2]),
    },
    timeZone,
  );
}

/** Timestamp dinâmico do Discord: cada pessoa vê no próprio fuso. */
export const discordTime = (date: Date, style: 'F' | 'R' | 'f' | 't' = 'F'): string =>
  `<t:${Math.floor(date.getTime() / 1000)}:${style}>`;
