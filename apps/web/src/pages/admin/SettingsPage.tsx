import { useEffect, useState, type FormEvent } from 'react';
import { Alert, Button, Card, Field, PageTitle, Spinner, inputClass } from '../../components/ui';
import { api } from '../../lib/api';
import { describeError } from '../../lib/errors';
import type { Settings, SettingsPatch } from '../../lib/types';
import { useAsync } from '../../lib/useAsync';

const SNOWFLAKE = /^\d{17,20}$/;

export interface SettingsForm {
  liveCategoryId: string;
  liveTextChannelId: string;
  announceChannelId: string;
  adminRoleIds: string;
  modRoleIds: string;
  meetingAllowedRoleIds: string;
  maxParticipantsLive: string;
  graceSeconds: string;
}

export const toForm = (s: Settings): SettingsForm => ({
  liveCategoryId: s.liveCategoryId ?? '',
  liveTextChannelId: s.liveTextChannelId ?? '',
  announceChannelId: s.announceChannelId ?? '',
  adminRoleIds: s.adminRoleIds.join(', '),
  modRoleIds: s.modRoleIds.join(', '),
  meetingAllowedRoleIds: s.meetingAllowedRoleIds.join(', '),
  maxParticipantsLive: String(s.maxParticipantsLive),
  graceSeconds: String(s.graceSeconds),
});

/** "1, 2  3" -> ["1", "2", "3"] */
export const parseIds = (text: string): string[] => [
  ...new Set(text.split(/[\s,;]+/).filter(Boolean)),
];

const sameList = (a: string[], b: string[]) =>
  a.length === b.length && a.every((v, i) => v === b[i]);

/**
 * Compara o formulário com o que está salvo e monta só o que mudou (o `PATCH` não
 * mexe no resto). Devolve os erros de preenchimento, se houver.
 */
export function buildSettingsPatch(
  original: Settings,
  form: SettingsForm,
): { patch: SettingsPatch } | { errors: string[] } {
  const errors: string[] = [];
  const patch: SettingsPatch = {};

  const channel = (
    key: 'liveCategoryId' | 'liveTextChannelId' | 'announceChannelId',
    label: string,
  ) => {
    const value = form[key].trim();
    if (value === '') {
      if (original[key] !== null) patch[key] = null;
    } else if (!SNOWFLAKE.test(value)) {
      errors.push(`${label}: use o ID numérico do Discord (17 a 20 dígitos).`);
    } else if (value !== original[key]) {
      patch[key] = value;
    }
  };
  channel('liveCategoryId', 'Categoria das lives');
  channel('liveTextChannelId', 'Canal dos embeds de live');
  channel('announceChannelId', 'Canal de avisos');

  const roles = (key: 'adminRoleIds' | 'modRoleIds' | 'meetingAllowedRoleIds', label: string) => {
    const ids = parseIds(form[key]);
    const bad = ids.find((id) => !SNOWFLAKE.test(id));
    if (bad) return void errors.push(`${label}: “${bad}” não é um ID válido.`);
    if (ids.length > 25) return void errors.push(`${label}: no máximo 25 cargos.`);
    if (!sameList(ids, original[key])) patch[key] = ids;
  };
  roles('adminRoleIds', 'Cargos de admin');
  roles('modRoleIds', 'Cargos de moderador');
  roles('meetingAllowedRoleIds', 'Cargos das reuniões');

  const max = Number(form.maxParticipantsLive);
  if (!Number.isInteger(max) || max < 2 || max > 100) {
    errors.push('Limite das lives: um número inteiro de 2 a 100.');
  } else if (max !== original.maxParticipantsLive) patch.maxParticipantsLive = max;

  const grace = Number(form.graceSeconds);
  if (!Number.isInteger(grace) || grace < 5 || grace > 300) {
    errors.push('Tolerância ao sair da call: um número inteiro de 5 a 300 segundos.');
  } else if (grace !== original.graceSeconds) patch.graceSeconds = grace;

  return errors.length > 0 ? { errors } : { patch };
}

function SettingsEditor({
  settings,
  onSaved,
}: {
  settings: Settings;
  onSaved: (s: Settings) => void;
}) {
  const [form, setForm] = useState<SettingsForm>(toForm(settings));
  const [errors, setErrors] = useState<string[]>([]);
  const [apiError, setApiError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => setForm(toForm(settings)), [settings]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaved(false);
    setApiError(null);
    const built = buildSettingsPatch(settings, form);
    if ('errors' in built) return setErrors(built.errors);
    setErrors([]);
    if (Object.keys(built.patch).length === 0) return setSaved(true);

    setSaving(true);
    try {
      const updated = await api.settings.update(built.patch);
      onSaved(updated);
      setSaved(true);
    } catch (err) {
      setApiError(describeError(err));
    } finally {
      setSaving(false);
    }
  }

  const set = (key: keyof SettingsForm) => (e: { target: { value: string } }) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  return (
    <form onSubmit={(e) => void submit(e)} className="space-y-6" aria-label="Configurações">
      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Lives</h2>
        <p className="text-sm text-zinc-500">
          No Discord, ative o modo desenvolvedor e use “Copiar ID” no canal ou cargo.
        </p>
        <Field
          label="Categoria das lives"
          htmlFor="s-cat"
          hint="Os canais de voz desta categoria abrem salas de live."
        >
          <input
            id="s-cat"
            className={inputClass}
            value={form.liveCategoryId}
            onChange={set('liveCategoryId')}
            inputMode="numeric"
          />
        </Field>
        <Field
          label="Canal dos embeds de live"
          htmlFor="s-live"
          hint="Onde o bot publica o link de cada live."
        >
          <input
            id="s-live"
            className={inputClass}
            value={form.liveTextChannelId}
            onChange={set('liveTextChannelId')}
            inputMode="numeric"
          />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Limite de pessoas por live" htmlFor="s-max">
            <input
              id="s-max"
              type="number"
              min={2}
              max={100}
              className={inputClass}
              value={form.maxParticipantsLive}
              onChange={set('maxParticipantsLive')}
            />
          </Field>
          <Field
            label="Tolerância ao sair da call (s)"
            htmlFor="s-grace"
            hint="Tempo para voltar antes de ser removido da live."
          >
            <input
              id="s-grace"
              type="number"
              min={5}
              max={300}
              className={inputClass}
              value={form.graceSeconds}
              onChange={set('graceSeconds')}
            />
          </Field>
        </div>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Reuniões</h2>
        <Field
          label="Canal de avisos"
          htmlFor="s-ann"
          hint="Avisos, lembretes e cancelamentos de reunião."
        >
          <input
            id="s-ann"
            className={inputClass}
            value={form.announceChannelId}
            onChange={set('announceChannelId')}
            inputMode="numeric"
          />
        </Field>
        <Field
          label="Cargos que podem entrar"
          htmlFor="s-meet"
          hint="IDs separados por vírgula. Vazio = todos os membros. Moderação entra sempre."
        >
          <textarea
            id="s-meet"
            rows={2}
            className={inputClass}
            value={form.meetingAllowedRoleIds}
            onChange={set('meetingAllowedRoleIds')}
          />
        </Field>
      </Card>

      <Card className="space-y-4">
        <h2 className="text-lg font-semibold text-white">Papéis</h2>
        <Field
          label="Cargos de admin"
          htmlFor="s-admin"
          hint="IDs separados por vírgula. O dono do servidor e quem tem permissão de Administrador já são admin."
        >
          <textarea
            id="s-admin"
            rows={2}
            className={inputClass}
            value={form.adminRoleIds}
            onChange={set('adminRoleIds')}
          />
        </Field>
        <Field label="Cargos de moderador" htmlFor="s-mod">
          <textarea
            id="s-mod"
            rows={2}
            className={inputClass}
            value={form.modRoleIds}
            onChange={set('modRoleIds')}
          />
        </Field>
      </Card>

      {errors.length > 0 && (
        <Alert tone="error" title="Confira os campos">
          <ul className="list-disc pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </Alert>
      )}
      {apiError && <Alert tone="error">{apiError}</Alert>}
      {saved && <Alert tone="success">Configurações salvas.</Alert>}

      <Button type="submit" variant="primary" loading={saving}>
        Salvar
      </Button>
    </form>
  );
}

export function SettingsPage() {
  const { state } = useAsync(() => api.settings.get());
  const [current, setCurrent] = useState<Settings | null>(null);

  const settings = current ?? (state.status === 'ready' ? state.data : null);

  return (
    <>
      <PageTitle>Configurações</PageTitle>
      {state.status === 'loading' && <Spinner label="Carregando…" />}
      {state.status === 'error' && <Alert tone="error">{describeError(state.error)}</Alert>}
      {settings && <SettingsEditor settings={settings} onSaved={setCurrent} />}
    </>
  );
}
