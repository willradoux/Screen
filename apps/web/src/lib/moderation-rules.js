import { ROLE_RANK } from '@screem/shared';
/**
 * Regras de moderação espelhadas do backend (docs/backend/permissoes.md), só para a
 * interface esconder ou desabilitar o que seria recusado. Quem decide de verdade é o
 * servidor: estas funções nunca substituem a checagem dele.
 */
/** Ninguém age sobre papel igual ou superior, nem sobre si mesmo. */
export function canModerateTarget(actor, target) {
    if (actor.id === target.id)
        return false;
    return ROLE_RANK[actor.role] > ROLE_RANK[target.role];
}
export const isStaff = (role) => ROLE_RANK[role] >= ROLE_RANK.MOD;
export const isAdmin = (role) => role === 'ADMIN';
/** Durações de banimento oferecidas a cada papel. */
export function banOptions(role) {
    const options = [
        { label: '15 minutos', minutes: 15 },
        { label: '1 hora', minutes: 60 },
        { label: '24 horas', minutes: 1440 },
    ];
    if (role === 'ADMIN')
        options.push({ label: 'Até o fim da sala', minutes: 0 });
    return options;
}
export const ROLE_LABEL = {
    MEMBER: 'Membro',
    MOD: 'Moderador',
    ADMIN: 'Admin',
};
