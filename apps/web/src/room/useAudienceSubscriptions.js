import { Track } from 'livekit-client';
import { useEffect } from 'react';
const VIDEO_SOURCES = [
    [Track.Source.Camera, 'camera'],
    [Track.Source.ScreenShare, 'screen'],
];
/** Muda quando o palco publica ou tira um vídeo (só olha quem pode transmitir: poucas pessoas). */
function videoSignature(media) {
    const parts = [];
    for (const p of media.remoteParticipants.values()) {
        if (!p.permissions?.canPublish)
            continue;
        for (const [source] of VIDEO_SOURCES) {
            const pub = p.getTrackPublication(source);
            if (pub)
                parts.push(`${p.identity}:${pub.trackSid}`);
        }
    }
    return parts.join('|');
}
/**
 * Espectador de sala grande recebe um único vídeo (o `wanted`); os demais vídeos do palco ficam
 * sem assinatura, o que tira esse custo do servidor. O áudio continua assinado para todo o palco.
 * Deve ser chamado a cada renderização da sala (o `useParticipants` já a agrupa a cada 250 ms).
 */
export function useAudienceSubscriptions(media, enabled, wanted) {
    const signature = media && enabled ? videoSignature(media) : '';
    useEffect(() => {
        if (!media || !enabled)
            return;
        for (const p of media.remoteParticipants.values()) {
            if (!p.permissions?.canPublish)
                continue;
            for (const [source, kind] of VIDEO_SOURCES) {
                const pub = p.getTrackPublication(source);
                if (!pub)
                    continue;
                const want = wanted?.identity === p.identity && wanted.source === kind;
                if (pub.isSubscribed !== want)
                    pub.setSubscribed(want);
            }
        }
    }, [media, enabled, wanted?.identity, wanted?.source, signature]);
}
