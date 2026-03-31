import React from 'react';
import type { ChatUser } from '../../types/chat';

function slug(s: string) {
  return s.replace(/\s+/g, '').toLowerCase();
}

export function buildMentionToken(u: ChatUser): string {
  const base = (u.name || u.email?.split('@')[0] || 'user').replace(/\s+/g, '');
  return base;
}

export function resolveMentionIds(content: string, users: ChatUser[]): string[] {
  const ids = new Set<string>();
  const re = /@(\S+)/g;
  let m: RegExpExecArray | null;
  const map = new Map(users.map((u) => [slug(buildMentionToken(u)), u.id]));
  while ((m = re.exec(content)) !== null) {
    const key = slug(m[1]);
    const id = map.get(key);
    if (id) ids.add(id);
    const byName = users.find((u) => slug(u.name || '') === key || slug(u.email || '') === key);
    if (byName) ids.add(byName.id);
  }
  return [...ids];
}

export type MentionBubbleVariant = 'incoming' | 'outgoing';

export function renderContentWithMentions(
  content: string,
  mentionUserIds: string[],
  usersById: Map<string, ChatUser>,
  bubbleVariant: MentionBubbleVariant = 'incoming'
): React.ReactNode {
  if (!content) return null;
  const parts: React.ReactNode[] = [];
  const re = /@(\S+)/g;
  let last = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = re.exec(content)) !== null) {
    if (m.index > last) {
      parts.push(<span key={`t-${key++}`}>{content.slice(last, m.index)}</span>);
    }
    const token = m[1];
    const slugTok = slug(token);
    let matched: ChatUser | undefined;
    for (const uid of mentionUserIds) {
      const u = usersById.get(uid);
      if (u && slug(buildMentionToken(u)) === slugTok) {
        matched = u;
        break;
      }
    }
    if (!matched) {
      matched = [...usersById.values()].find(
        (u) => slug(u.name || '') === slugTok || slug(u.email?.split('@')[0] || '') === slugTok
      );
    }
    if (matched) {
      const mentionCls =
        bubbleVariant === 'outgoing'
          ? 'font-semibold text-indigo-100 bg-white/20 px-0.5 rounded'
          : 'text-indigo-600 font-medium bg-indigo-50 px-0.5 rounded';
      parts.push(
        <span key={`m-${key++}`} className={mentionCls}>
          @{matched.name || matched.email}
        </span>
      );
    } else {
      parts.push(
        <span key={`u-${key++}`} className={bubbleVariant === 'outgoing' ? 'text-indigo-100/90' : undefined}>
          @{token}
        </span>
      );
    }
    last = m.index + m[0].length;
  }
  if (last < content.length) {
    parts.push(<span key={`e-${key++}`}>{content.slice(last)}</span>);
  }
  return parts.length ? parts : content;
}
