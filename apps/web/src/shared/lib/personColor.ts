import { useEffect, useState, type CSSProperties } from 'react';

/*
 * Cor da pessoa (estilo Discord): a miniatura sem câmera e a capa da sala ficam tingidas com a
 * cor da foto de perfil. Enquanto a foto não carrega (ou sem foto, ou se o navegador não deixar
 * ler os pixels), vale uma cor pastel fixa escolhida pelo id. Os pastéis são da paleta do design:
 * lilás, azul, marrom, ciano, verde, grafite, coral e menta.
 */

/** Matiz (0–360) e saturação (0–1) de cada pastel. */
const PALETTE: Array<[number, number]> = [
  [280, 0.32], // lilás
  [218, 0.45], // azul
  [14, 0.24], // marrom
  [190, 0.55], // ciano
  [112, 0.22], // verde
  [240, 0.06], // grafite
  [6, 0.5], // coral
  [155, 0.38], // menta
];

function hash(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export interface Tint {
  hue: number;
  sat: number;
}

export function tintFor(key: string): Tint {
  const [hue, sat] = PALETTE[hash(key) % PALETTE.length]!;
  return { hue, sat };
}

/** Variáveis CSS do degradê: `--tint-1` (alto), `--tint-2` (baixo) e `--tint-ring` (bolinha). */
export function tintStyle(t: Tint): CSSProperties {
  const s = Math.round(t.sat * 100);
  // Tons claros (ciano) ficam claros no alto; os outros, médios. Embaixo, sempre mais escuro.
  const light = t.hue > 170 && t.hue < 200 ? 72 : 50;
  return {
    '--tint-1': `hsl(${t.hue} ${s}% ${light}%)`,
    '--tint-2': `hsl(${t.hue} ${Math.max(0, s - 6)}% ${light - 22}%)`,
    '--tint-ring': `hsl(${t.hue} ${Math.min(100, s + 10)}% ${Math.min(92, light + 22)}%)`,
  } as CSSProperties;
}

const cache = new Map<string, Tint | null>();

function rgbToTint(r: number, g: number, b: number): Tint {
  const max = Math.max(r, g, b) / 255;
  const min = Math.min(r, g, b) / 255;
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  if (d > 0) {
    const rn = r / 255;
    const gn = g / 255;
    const bn = b / 255;
    if (max === rn) h = ((gn - bn) / d) % 6;
    else if (max === gn) h = (bn - rn) / d + 2;
    else h = (rn - gn) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  // Pastel: satura pouco, nunca neon.
  return { hue: Math.round(h), sat: Math.min(0.55, s * 0.7) };
}

function readAverage(url: string): Promise<Tint | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.decoding = 'async';
    img.onload = () => {
      try {
        const c = document.createElement('canvas');
        c.width = 8;
        c.height = 8;
        const ctx = c.getContext('2d', { willReadFrequently: true });
        if (!ctx) return resolve(null);
        ctx.drawImage(img, 0, 0, 8, 8);
        const { data } = ctx.getImageData(0, 0, 8, 8);
        let r = 0;
        let g = 0;
        let b = 0;
        let n = 0;
        for (let i = 0; i < data.length; i += 4) {
          if (data[i + 3]! < 128) continue;
          r += data[i]!;
          g += data[i + 1]!;
          b += data[i + 2]!;
          n++;
        }
        resolve(n ? rgbToTint(r / n, g / n, b / n) : null);
      } catch {
        // Foto de outro site sem permissão de leitura: fica a cor fixa.
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

/** Cor da pessoa: começa com o pastel do id e troca pela cor da foto quando ela carrega. */
export function usePersonTint(key: string, avatarUrl: string | null | undefined): CSSProperties {
  const [fromPhoto, setFromPhoto] = useState<Tint | null>(() =>
    avatarUrl ? (cache.get(avatarUrl) ?? null) : null,
  );
  useEffect(() => {
    if (!avatarUrl || import.meta.env.MODE === 'test') return;
    if (cache.has(avatarUrl)) {
      setFromPhoto(cache.get(avatarUrl) ?? null);
      return;
    }
    let alive = true;
    void readAverage(avatarUrl).then((t) => {
      cache.set(avatarUrl, t);
      if (alive) setFromPhoto(t);
    });
    return () => {
      alive = false;
    };
  }, [avatarUrl]);
  return tintStyle(fromPhoto ?? tintFor(key));
}
