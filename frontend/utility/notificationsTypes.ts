// Shared shapes for the in-app notifications inbox (API + hook + bell UI).

export interface NotificationItem {
  id: number;
  type: 'reply';
  actorName: string;
  commentId: number; // the reply that triggered it
  anilistId: number;
  targetType: 'anime' | 'episode';
  episode: number | null;
  snippet: string;
  createdAt: string; // ISO 8601
  read: boolean;
  href: string; // deep link to the comment's page
}

export interface NotificationsResponse {
  items: NotificationItem[];
  unread: number;
}
