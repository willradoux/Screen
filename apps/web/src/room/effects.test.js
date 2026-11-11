import { jsx as _jsx } from "react/jsx-runtime";
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { createVoiceProcessor, VOICE_PRESETS } from '../lib/voiceEffects';
import { BACKGROUND_IMAGES } from '../lib/videoEffects';
import { CaptionsOverlay } from './captions';
/** Web Audio de mentira: guarda os nós criados e as ligações. */
function fakeAudioContext() {
    const made = [];
    const node = (kind) => {
        made.push(kind);
        return {
            connect: vi.fn(),
            disconnect: vi.fn(),
            start: vi.fn(),
            stop: vi.fn(),
            gain: { value: 1 },
            frequency: { value: 0 },
            delayTime: { value: 0 },
            Q: { value: 0 },
            type: '',
            curve: null,
            stream: { getAudioTracks: () => [{ id: `out-${kind}` }] },
        };
    };
    const ctx = {
        createMediaStreamSource: () => node('source'),
        createMediaStreamDestination: () => node('dest'),
        createGain: () => node('gain'),
        createOscillator: () => node('osc'),
        createDelay: () => node('delay'),
        createBiquadFilter: () => node('biquad'),
        createWaveShaper: () => node('shaper'),
    };
    return { ctx: ctx, made };
}
describe('efeitos de voz', () => {
    it('os presets oferecidos', () => {
        expect(VOICE_PRESETS.map((p) => p.value)).toEqual(['none', 'robot', 'echo', 'radio']);
    });
    it.each([
        ['robot', ['osc', 'gain']],
        ['echo', ['delay', 'gain']],
        ['radio', ['biquad', 'shaper']],
    ])('%s monta o grafo de áudio e devolve a faixa processada', async (preset, expected) => {
        vi.stubGlobal('MediaStream', class {
            tracks;
            constructor(tracks) {
                this.tracks = tracks;
            }
        });
        const { ctx, made } = fakeAudioContext();
        const p = createVoiceProcessor(preset);
        await p.init({
            kind: 'audio',
            track: { id: 'mic' },
            audioContext: ctx,
        });
        for (const kind of expected)
            expect(made).toContain(kind);
        expect(p.processedTrack).toBeDefined();
        await p.destroy();
        expect(p.processedTrack).toBeUndefined();
        vi.unstubAllGlobals();
    });
    it('restart refaz o grafo sem vazar nós antigos', async () => {
        vi.stubGlobal('MediaStream', class {
            tracks;
            constructor(tracks) {
                this.tracks = tracks;
            }
        });
        const { ctx, made } = fakeAudioContext();
        const p = createVoiceProcessor('echo');
        const opts = {
            kind: 'audio',
            track: { id: 'mic' },
            audioContext: ctx,
        };
        await p.init(opts);
        const first = made.length;
        await p.restart(opts);
        expect(made.length).toBe(first * 2);
        vi.unstubAllGlobals();
    });
});
describe('fundos prontos', () => {
    it('são arquivos do próprio site', () => {
        for (const b of BACKGROUND_IMAGES)
            expect(b.url.startsWith('/backgrounds/')).toBe(true);
    });
});
describe('CaptionsOverlay', () => {
    const cap = (userId, text, at) => ({
        userId,
        displayName: `N${userId}`,
        text,
        final: true,
        at,
    });
    it('mostra quem falou e o quê, só as mais recentes', () => {
        render(_jsx(CaptionsOverlay, { now: 10_000, captions: [
                cap('1', 'um', 9_000),
                cap('2', 'dois', 9_500),
                cap('3', 'três', 9_800),
                cap('4', 'quatro', 9_900),
            ] }));
        expect(screen.queryByText('um')).not.toBeInTheDocument(); // só as 3 últimas
        expect(screen.getByText('quatro')).toBeInTheDocument();
        expect(screen.getByLabelText('Legendas')).toBeInTheDocument();
    });
    it('legenda antiga some; sem legendas não renderiza nada', () => {
        const { container } = render(_jsx(CaptionsOverlay, { now: 20_000, captions: [cap('1', 'velha', 1_000)] }));
        expect(container.textContent).toBe('');
    });
});
