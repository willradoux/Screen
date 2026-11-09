import { Link } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { api } from '../lib/api';
import { isAdmin } from '../lib/moderation-rules';
import { useAsync } from '../lib/useAsync';
import { Alert } from './ui';

export interface SetupStatus {
  botInGuild: boolean;
  livesConfigured: boolean;
  announceConfigured: boolean;
}

/** Frases de aviso para o que não está configurado. Admin recebe o caminho; membro, o pedido. */
export function setupProblems(status: SetupStatus, admin: boolean): string[] {
  const contact = admin ? '' : ' Fale com um administrador.';
  const problems: string[] = [];
  if (!status.botInGuild) {
    problems.push(
      admin
        ? 'O bot do Discord não está conectado ao servidor. Confira se ele foi convidado e se o token está certo.'
        : `O bot do Discord não está no servidor, então as lives não abrem.${contact}`,
    );
  }
  if (!status.livesConfigured) {
    problems.push(
      admin
        ? 'Nenhuma call foi escolhida para as lives.'
        : `As calls de live ainda não foram configuradas.${contact}`,
    );
  }
  if (!status.announceConfigured) {
    problems.push(
      admin
        ? 'O canal de avisos das reuniões não foi escolhido.'
        : `O canal de avisos ainda não foi configurado.${contact}`,
    );
  }
  return problems;
}

/** Aviso no topo quando falta configurar algo, para ninguém ficar sem entender por que não funciona. */
export function SetupBanners() {
  const { user } = useAuth();
  const { state } = useAsync(() => api.system.status());
  if (state.status !== 'ready' || !user) return null; // se a consulta falhar, não atrapalha a página
  const admin = isAdmin(user.role);
  const problems = setupProblems(state.data, admin);
  if (problems.length === 0) return null;
  return (
    <div className="mb-6">
      <Alert tone="warning" title="Configuração incompleta">
        <ul className="list-disc pl-5">
          {problems.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        {admin && (
          <Link to="/admin/config" className="mt-2 inline-block underline">
            Ir para Configurações
          </Link>
        )}
      </Alert>
    </div>
  );
}
