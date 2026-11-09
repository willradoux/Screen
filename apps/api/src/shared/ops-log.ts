/**
 * Eventos operacionais (erros, avisos, ações importantes) que o painel pode mandar para um
 * canal de logs do Discord. Quem produz o evento não sabe para onde ele vai: o destino é ligado
 * na inicialização (`opsLog.sink`). Sem destino, não faz nada.
 */
export type OpsLevel = 'info' | 'warn' | 'error';

export interface OpsEvent {
  level: OpsLevel;
  /** O que aconteceu, em uma frase. */
  title: string;
  /** Por que e o que fazer. */
  description?: string;
  fields?: { name: string; value: string }[];
}

export const opsLog = {
  sink: null as ((event: OpsEvent) => void) | null,
  emit(event: OpsEvent): void {
    try {
      this.sink?.(event);
    } catch {
      // O log nunca pode quebrar quem está logando.
    }
  },
  info(title: string, description?: string, fields?: OpsEvent['fields']) {
    this.emit({
      level: 'info',
      title,
      ...(description ? { description } : {}),
      ...(fields ? { fields } : {}),
    });
  },
  warn(title: string, description?: string, fields?: OpsEvent['fields']) {
    this.emit({
      level: 'warn',
      title,
      ...(description ? { description } : {}),
      ...(fields ? { fields } : {}),
    });
  },
  error(title: string, description?: string, fields?: OpsEvent['fields']) {
    this.emit({
      level: 'error',
      title,
      ...(description ? { description } : {}),
      ...(fields ? { fields } : {}),
    });
  },
};
