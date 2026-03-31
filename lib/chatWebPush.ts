import webpush from 'web-push';
import { PushSubscription, User } from '../models/index.js';
import { logger } from './logger.js';

const CHAT_ICON = 'https://i.imgur.com/uQrmMqG.png';

export function isWebPushConfigured(): boolean {
  const pub = process.env.VAPID_PUBLIC_KEY?.trim();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim();
  return Boolean(pub && priv);
}

export function getVapidPublicKey(): string | null {
  const k = process.env.VAPID_PUBLIC_KEY?.trim();
  return k || null;
}

let vapidInitialized = false;

function ensureVapid(): void {
  if (vapidInitialized || !isWebPushConfigured()) return;
  const subject = process.env.VAPID_SUBJECT?.trim() || 'mailto:noreply@localhost';
  webpush.setVapidDetails(subject, process.env.VAPID_PUBLIC_KEY!.trim(), process.env.VAPID_PRIVATE_KEY!.trim());
  vapidInitialized = true;
}

function truncate(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

async function channelTitleForRecipient(
  ch: { type: string; name: string; members?: string[] },
  recipientUserId: string
): Promise<string> {
  if (ch.type !== 'dm') return ch.name || 'Canal';
  const peerId = ch.members?.find((m) => m !== recipientUserId);
  if (!peerId) return ch.name || 'Chat';
  const peer = await User.findOne({ id: peerId }).select('name email').lean().exec();
  const label = (peer?.name && String(peer.name).trim()) || peer?.email || 'Chat';
  return `💬 ${label}`;
}

export async function notifyChatMessagePush(params: {
  channel: { id: string; type: string; name: string; members?: string[] };
  senderUserId: string;
  authorName: string;
  textPreview: string;
  isThread: boolean;
  messageId: string;
}): Promise<void> {
  if (!isWebPushConfigured()) return;
  ensureVapid();

  const { channel, senderUserId, authorName, textPreview, isThread, messageId } = params;
  const members = channel.members || [];
  const targets = members.filter((m) => m !== senderUserId);
  if (!targets.length) return;

  const preview = truncate(textPreview, 200);
  const body = isThread ? `${authorName} en un hilo: ${preview}` : `${authorName}: ${preview}`;

  for (const recipientId of targets) {
    const title = await channelTitleForRecipient(channel, recipientId);
    const subs = await PushSubscription.find({ user_id: recipientId }).lean().exec();
    for (const sub of subs) {
      const urlPath = `${sub.chat_base_path}?channel=${encodeURIComponent(channel.id)}`;
      const payload = JSON.stringify({
        title,
        body,
        url: urlPath,
        tag: `dailys-push-${messageId}`,
        icon: CHAT_ICON,
      });
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: { p256dh: sub.p256dh, auth: sub.auth },
          },
          payload,
          { TTL: 86_400 }
        );
      } catch (err: unknown) {
        const status = (err as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await PushSubscription.deleteOne({ endpoint: sub.endpoint }).exec();
        }
        logger.server.warn(`Web push falló (${status ?? '?'})`, (err as Error).message);
      }
    }
  }
}
