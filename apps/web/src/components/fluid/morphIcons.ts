import { fitPath } from '@usefluid/motion';
import mic from '@material-symbols/svg-400/rounded/mic.svg?raw';
import micOff from '@material-symbols/svg-400/rounded/mic_off.svg?raw';
import videocam from '@material-symbols/svg-400/rounded/videocam.svg?raw';
import videocamOff from '@material-symbols/svg-400/rounded/videocam_off.svg?raw';
import screenShare from '@material-symbols/svg-400/rounded/screen_share.svg?raw';
import stopScreenShare from '@material-symbols/svg-400/rounded/stop_screen_share.svg?raw';
import headphones from '@material-symbols/svg-400/rounded/headphones.svg?raw';
import headsetOff from '@material-symbols/svg-400/rounded/headset_off.svg?raw';

/*
 * Ícones que se transformam (Fluid, Metamorph): os mesmos do Material Symbols que o site usa,
 * convertidos para a caixa de 120 x 120 do motor. Ligar e desligar o microfone, a câmera, a tela
 * e o som da sala vira um morph com mola entre os dois desenhos, em vez de uma troca seca.
 */

/** O `d` do único `<path>` do SVG do Material Symbols. */
function pathOf(svg: string): string {
  const d = /\sd="([^"]+)"/.exec(svg)?.[1];
  if (!d) throw new Error('ícone sem path');
  return fitPath(d, 120, 6);
}

export const MORPH_ICONS = {
  mic: pathOf(mic),
  mic_off: pathOf(micOff),
  videocam: pathOf(videocam),
  videocam_off: pathOf(videocamOff),
  screen_share: pathOf(screenShare),
  stop_screen_share: pathOf(stopScreenShare),
  headphones: pathOf(headphones),
  headset_off: pathOf(headsetOff),
} as const;

export type MorphIconName = keyof typeof MORPH_ICONS;

export const isMorphIcon = (name: string): name is MorphIconName => name in MORPH_ICONS;
