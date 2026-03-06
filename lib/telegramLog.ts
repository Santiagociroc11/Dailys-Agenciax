/**
 * Log persistente de envíos de notificaciones Telegram.
 * Registra cada intento de envío en MongoDB.
 */

import { TelegramNotificationLog } from '../models/TelegramNotificationLog.js';
import { logger } from './logger.js';

export type TelegramLogType =
  | 'test'
  | 'admin-notification'
  | 'task-available'
  | 'user-task-in-review'
  | 'deadline-reminder'
  | 'daily-summary'
  | 'budget-alert'
  | 'admin-morning-report'
  | 'admin-evening-report';

export type TelegramLogStatus = 'success' | 'failed' | 'skipped';

export interface TelegramLogEntry {
  id: string;
  timestamp: string;
  type: TelegramLogType;
  recipient: string;
  recipientLabel?: string;
  status: TelegramLogStatus;
  details?: string;
  error?: string;
}

/**
 * Registra un envío de notificación Telegram en la base de datos.
 */
export async function logTelegramSend(
  type: TelegramLogType,
  recipient: string,
  status: TelegramLogStatus,
  options?: { recipientLabel?: string; details?: string; error?: string }
): Promise<void> {
  try {
    await TelegramNotificationLog.create({
      type,
      recipient,
      recipient_label: options?.recipientLabel ?? undefined,
      status,
      details: options?.details ?? undefined,
      error: options?.error ?? undefined,
    });
  } catch (err) {
    logger.db.error('Error guardando log Telegram en BD', err as Error);
  }

  const label = options?.recipientLabel || recipient;
  logger.telegram.telegram(type, label, status, options?.error || options?.details);
}

/**
 * Registra el inicio de un envío (intento). Solo consola, no persiste.
 */
export function logTelegramAttempt(
  type: TelegramLogType,
  recipient: string,
  options?: { recipientLabel?: string; details?: string }
): void {
  const label = options?.recipientLabel || recipient;
  logger.telegram.attempt(type, label, options?.details);
}

/**
 * Devuelve las últimas entradas del log desde la base de datos.
 */
export async function getTelegramLogEntries(
  limit = 50,
  filters?: { type?: TelegramLogType; status?: TelegramLogStatus }
): Promise<TelegramLogEntry[]> {
  const query: Record<string, unknown> = {};
  if (filters?.type) query.type = filters.type;
  if (filters?.status) query.status = filters.status;

  const docs = await TelegramNotificationLog.find(query)
    .sort({ createdAt: -1 })
    .limit(Math.min(limit, 500))
    .lean()
    .exec();

  return docs.map((d) => ({
    id: d.id,
    timestamp: (d as { createdAt?: Date }).createdAt?.toISOString() ?? new Date().toISOString(),
    type: d.type as TelegramLogType,
    recipient: d.recipient,
    recipientLabel: d.recipient_label ?? undefined,
    status: d.status as TelegramLogStatus,
    details: d.details ?? undefined,
    error: d.error ?? undefined,
  }));
}

/**
 * Devuelve resumen de estadísticas del log desde la base de datos.
 */
export async function getTelegramLogStats(filters?: {
  since?: Date;
  type?: TelegramLogType;
}): Promise<{
  total: number;
  success: number;
  failed: number;
  skipped: number;
  byType: Record<string, { success: number; failed: number; skipped: number }>;
}> {
  const match: Record<string, unknown> = {};
  if (filters?.since) match.createdAt = { $gte: filters.since };
  if (filters?.type) match.type = filters.type;

  const pipeline: Record<string, unknown>[] = [];
  if (Object.keys(match).length > 0) {
    pipeline.push({ $match: match });
  }

  pipeline.push(
    {
      $group: {
        _id: { type: '$type', status: '$status' },
        count: { $sum: 1 },
      },
    },
    {
      $group: {
        _id: '$_id.type',
        success: { $sum: { $cond: [{ $eq: ['$_id.status', 'success'] }, '$count', 0] } },
        failed: { $sum: { $cond: [{ $eq: ['$_id.status', 'failed'] }, '$count', 0] } },
        skipped: { $sum: { $cond: [{ $eq: ['$_id.status', 'skipped'] }, '$count', 0] } },
      },
    }
  );

  const byTypeResult = await TelegramNotificationLog.aggregate(
    pipeline as unknown as import('mongoose').PipelineStage[]
  ).exec();

  const byType: Record<string, { success: number; failed: number; skipped: number }> = {};
  let success = 0,
    failed = 0,
    skipped = 0;

  for (const r of byTypeResult) {
    byType[r._id ?? 'unknown'] = {
      success: r.success ?? 0,
      failed: r.failed ?? 0,
      skipped: r.skipped ?? 0,
    };
    success += r.success ?? 0;
    failed += r.failed ?? 0;
    skipped += r.skipped ?? 0;
  }

  const countMatch = Object.keys(match).length > 0 ? match : {};
  const total = await TelegramNotificationLog.countDocuments(countMatch).exec();

  return {
    total,
    success,
    failed,
    skipped,
    byType,
  };
}
