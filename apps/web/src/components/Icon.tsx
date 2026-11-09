import arrowBack from '@material-symbols/svg-400/rounded/arrow_back.svg?url';
import bedtime from '@material-symbols/svg-400/rounded/bedtime.svg?url';
import block from '@material-symbols/svg-400/rounded/block.svg?url';
import calendarMonth from '@material-symbols/svg-400/rounded/calendar_month.svg?url';
import callEnd from '@material-symbols/svg-400/rounded/call_end.svg?url';
import campaign from '@material-symbols/svg-400/rounded/campaign.svg?url';
import check from '@material-symbols/svg-400/rounded/check.svg?url';
import checkCircle from '@material-symbols/svg-400/rounded/check_circle.svg?url';
import chevronRight from '@material-symbols/svg-400/rounded/chevron_right.svg?url';
import close from '@material-symbols/svg-400/rounded/close.svg?url';
import cancel from '@material-symbols/svg-400/rounded/cancel.svg?url';
import dark from '@material-symbols/svg-400/rounded/dark_mode.svg?url';
import dashboard from '@material-symbols/svg-400/rounded/dashboard.svg?url';
import download from '@material-symbols/svg-400/rounded/download.svg?url';
import edit from '@material-symbols/svg-400/rounded/edit.svg?url';
import error from '@material-symbols/svg-400/rounded/error.svg?url';
import group from '@material-symbols/svg-400/rounded/group.svg?url';
import history from '@material-symbols/svg-400/rounded/history.svg?url';
import info from '@material-symbols/svg-400/rounded/info.svg?url';
import light from '@material-symbols/svg-400/rounded/light_mode.svg?url';
import lock from '@material-symbols/svg-400/rounded/lock.svg?url';
import logout from '@material-symbols/svg-400/rounded/logout.svg?url';
import mic from '@material-symbols/svg-400/rounded/mic.svg?url';
import micOff from '@material-symbols/svg-400/rounded/mic_off.svg?url';
import openInNew from '@material-symbols/svg-400/rounded/open_in_new.svg?url';
import personRemove from '@material-symbols/svg-400/rounded/person_remove.svg?url';
import playArrow from '@material-symbols/svg-400/rounded/play_arrow.svg?url';
import progress from '@material-symbols/svg-400/rounded/progress_activity.svg?url';
import radio from '@material-symbols/svg-400/rounded/radio_button_checked.svg?url';
import recordVoice from '@material-symbols/svg-400/rounded/record_voice_over.svg?url';
import schedule from '@material-symbols/svg-400/rounded/schedule.svg?url';
import screenShare from '@material-symbols/svg-400/rounded/screen_share.svg?url';
import settings from '@material-symbols/svg-400/rounded/settings.svg?url';
import stopScreenShare from '@material-symbols/svg-400/rounded/stop_screen_share.svg?url';
import syncProblem from '@material-symbols/svg-400/rounded/sync_problem.svg?url';
import videocam from '@material-symbols/svg-400/rounded/videocam.svg?url';
import videocamOff from '@material-symbols/svg-400/rounded/videocam_off.svg?url';
import visibility from '@material-symbols/svg-400/rounded/visibility.svg?url';
import warning from '@material-symbols/svg-400/rounded/warning.svg?url';
import wifiOff from '@material-symbols/svg-400/rounded/wifi_off.svg?url';

/**
 * Ícones do Material Symbols (Google), estilo arredondado, empacotados como arquivos SVG
 * (só entram no site os que estão nesta lista). Sem emoji em nenhum lugar da interface.
 */
const ICONS = {
  arrow_back: arrowBack,
  bedtime,
  block,
  calendar_month: calendarMonth,
  call_end: callEnd,
  campaign,
  cancel,
  check,
  check_circle: checkCircle,
  chevron_right: chevronRight,
  close,
  dark_mode: dark,
  dashboard,
  download,
  edit,
  error,
  group,
  history,
  info,
  light_mode: light,
  lock,
  logout,
  mic,
  mic_off: micOff,
  open_in_new: openInNew,
  person_remove: personRemove,
  play_arrow: playArrow,
  progress_activity: progress,
  radio_button_checked: radio,
  record_voice_over: recordVoice,
  schedule,
  screen_share: screenShare,
  settings,
  stop_screen_share: stopScreenShare,
  sync_problem: syncProblem,
  videocam,
  videocam_off: videocamOff,
  visibility,
  warning,
  wifi_off: wifiOff,
} as const;

export type IconName = keyof typeof ICONS;

/** Ícone que herda a cor do texto (`currentColor`) e o tamanho da fonte. */
export function Icon({
  name,
  className = '',
  size = '1.25em',
  label,
}: {
  name: IconName;
  className?: string;
  size?: string;
  /** Texto para leitores de tela; sem ele o ícone é decorativo. */
  label?: string;
}) {
  const url = `url("${ICONS[name]}")`;
  return (
    <span
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={`inline-block shrink-0 bg-current align-[-0.2em] ${className}`}
      style={{
        width: size,
        height: size,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
      }}
    />
  );
}
