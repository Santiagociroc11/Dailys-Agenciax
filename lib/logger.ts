/**
 * Logger unificado para el backend.
 * Formato legible con colores en terminal (si está disponible).
 */

const isTTY = process.stdout?.isTTY ?? false;

const colors = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function c(code: keyof typeof colors): string {
  return isTTY ? colors[code] : '';
}

function shortTime(): string {
  const d = new Date();
  return d.toTimeString().slice(0, 8);
}

type LogLevel = 'info' | 'warn' | 'error';

function formatMessage(level: LogLevel, prefix: string, msg: string, extra?: string): string {
  const ts = shortTime();
  const prefixStr = prefix ? `[${prefix}]` : '';
  const levelStr = level === 'error' ? 'ERR' : level === 'warn' ? 'WRN' : 'INF';
  const parts = [ts, prefixStr, levelStr, msg];
  if (extra) parts.push(extra);
  return parts.filter(Boolean).join(' ');
}

export function createLogger(prefix: string, color: keyof typeof colors = 'cyan') {
  return {
    info(msg: string, extra?: string) {
      const line = formatMessage('info', prefix, msg, extra);
      console.log(`${c('dim')}${line}${c('reset')}`);
    },
    success(msg: string, extra?: string) {
      const line = formatMessage('info', prefix, msg, extra);
      console.log(`${c('green')}${line}${c('reset')}`);
    },
    warn(msg: string, extra?: string) {
      const line = formatMessage('warn', prefix, msg, extra);
      console.warn(`${c('yellow')}${line}${c('reset')}`);
    },
    error(msg: string, extra?: string | Error) {
      const errStr = extra instanceof Error ? extra.message : extra;
      const line = formatMessage('error', prefix, msg, errStr);
      console.error(`${c('red')}${line}${c('reset')}`);
      if (extra instanceof Error && extra.stack) {
        console.error(`${c('dim')}${extra.stack}${c('reset')}`);
      }
    },
    /** Para logs de Telegram: intento (antes de enviar) */
    attempt(type: string, recipient: string, detail?: string) {
      const line = `${shortTime()} [${prefix}] ${type} → ${recipient} ${c('dim')}↗ enviando${c('reset')}${detail ? ` ${c('dim')}| ${detail}${c('reset')}` : ''}`;
      console.log(line);
    },
    /** Para logs de Telegram: tipo | destinatario | estado */
    telegram(type: string, recipient: string, status: 'success' | 'failed' | 'skipped', detail?: string) {
      const icon = status === 'success' ? '✓' : status === 'failed' ? '✗' : '○';
      const statusColor = status === 'success' ? 'green' : status === 'failed' ? 'red' : 'yellow';
      const line = `${shortTime()} [${prefix}] ${type} → ${recipient} ${c(statusColor)}${icon} ${status}${c('reset')}${detail ? ` ${c('dim')}| ${detail}${c('reset')}` : ''}`;
      if (status === 'failed') {
        console.error(line);
      } else {
        console.log(line);
      }
    },
  };
}

export const logger = {
  server: createLogger('SERVER', 'blue'),
  telegram: createLogger('TELEGRAM', 'magenta'),
  db: createLogger('DB', 'cyan'),
};
