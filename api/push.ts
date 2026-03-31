import { Router, type Request, type Response } from 'express';
import { PushSubscription } from '../models/index.js';
import { User } from '../models/index.js';
import { getVapidPublicKey, isWebPushConfigured } from '../lib/chatWebPush.js';

const router = Router();

function getUserId(req: Request): string | null {
  const h = req.headers['x-user-id'];
  if (Array.isArray(h)) return h[0] || null;
  return typeof h === 'string' && h ? h : null;
}

/** GET /vapid-public-key — clave pública para suscribirse desde el cliente */
router.get('/vapid-public-key', (_req: Request, res: Response) => {
  if (!isWebPushConfigured()) {
    res.status(503).json({ configured: false, error: 'Push no configurado en el servidor (VAPID)' });
    return;
  }
  const publicKey = getVapidPublicKey();
  res.json({ configured: true, publicKey });
});

type SubscribeBody = {
  subscription?: {
    endpoint?: string;
    keys?: { p256dh?: string; auth?: string };
  };
  chatBasePath?: string;
};

/** POST /subscribe */
router.post('/subscribe', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const user = await User.findOne({ id: userId, is_active: { $ne: false } }).lean().exec();
    if (!user) {
      res.status(401).json({ error: 'Usuario no válido' });
      return;
    }
    if (!isWebPushConfigured()) {
      res.status(503).json({ error: 'Push no configurado en el servidor' });
      return;
    }

    const { subscription, chatBasePath } = req.body as SubscribeBody;
    const endpoint = subscription?.endpoint?.trim();
    const p256dh = subscription?.keys?.p256dh?.trim();
    const auth = subscription?.keys?.auth?.trim();
    const base =
      chatBasePath === '/user/chat' || chatBasePath === '/chat' ? chatBasePath : null;

    if (!endpoint || !p256dh || !auth || !base) {
      res.status(400).json({ error: 'subscription o chatBasePath inválidos' });
      return;
    }

    const existing = await PushSubscription.findOne({ endpoint }).exec();
    if (existing) {
      existing.user_id = userId;
      existing.p256dh = p256dh;
      existing.auth = auth;
      existing.chat_base_path = base;
      await existing.save();
    } else {
      await PushSubscription.create({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        chat_base_path: base,
      });
    }

    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

/** POST /unsubscribe — elimina la suscripción de este dispositivo */
router.post('/unsubscribe', async (req: Request, res: Response) => {
  try {
    const userId = getUserId(req);
    if (!userId) {
      res.status(401).json({ error: 'Falta X-User-Id' });
      return;
    }
    const endpoint = typeof req.body?.endpoint === 'string' ? req.body.endpoint.trim() : '';
    if (!endpoint) {
      res.status(400).json({ error: 'endpoint requerido' });
      return;
    }
    await PushSubscription.deleteOne({ user_id: userId, endpoint }).exec();
    res.json({ ok: true });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error';
    res.status(500).json({ error: msg });
  }
});

export const pushRouter = router;
