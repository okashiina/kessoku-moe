// Shared shapes for the in-app notifications inbox (API + hook + bell UI).

export interface NotificationItem {
  id: number;
  type: 'reply' | 'manga_chapter';
  actorName: string;
  commentId: number; // the reply that triggered it (0 for manga_chapter)
  anilistId: number;
  targetType: 'anime' | 'episode' | 'manga';
  episode: number | null;
  snippet: string;
  createdAt: string; // ISO 8601
  read: boolean;
  href: string; // deep link: the comment's page, or /manga/<id> for chapters
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}
