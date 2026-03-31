export interface ChatChannel {
  id: string;
  name: string;
  type: 'project' | 'custom' | 'dm';
  project_id?: string | null;
  description?: string | null;
  members?: string[];
  created_by?: string;
  last_message_at?: string | null;
  unread_count?: number;
}

export interface ChatMessage {
  id: string;
  channel_id: string;
  user_id: string;
  content: string;
  thread_id: string | null;
  reply_count: number;
  mentions: string[];
  reactions: { emoji: string; user_ids: string[] }[];
  is_edited: boolean;
  edited_at: string | null;
  is_deleted: boolean;
  created_at: string;
  updated_at?: string;
}

export interface ChatUser {
  id: string;
  name?: string;
  email?: string;
  role?: string;
}
