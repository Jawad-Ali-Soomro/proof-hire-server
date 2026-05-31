export const NotificationType = {
  BID_RECEIVED: 'BID_RECEIVED',
  BID_ACCEPTED: 'BID_ACCEPTED',
  BID_REJECTED: 'BID_REJECTED',
  CONTRACT_STARTED: 'CONTRACT_STARTED',
  MILESTONE_COMPLETED: 'MILESTONE_COMPLETED',
  WORK_MARKED_COMPLETE: 'WORK_MARKED_COMPLETE',
  PAYMENT_SENT: 'PAYMENT_SENT',
  PAYMENT_RECEIVED: 'PAYMENT_RECEIVED',
  CONTRACT_FINALIZED: 'CONTRACT_FINALIZED',
} as const;

export type NotificationTypeValue =
  (typeof NotificationType)[keyof typeof NotificationType];

export type CreateNotificationInput = {
  userId: number;
  type: NotificationTypeValue;
  title: string;
  body: string;
  link?: string;
  metadata?: Record<string, unknown>;
};

export type NotificationPayload = {
  id: number;
  userId: number;
  type: string;
  title: string;
  body: string;
  link: string | null;
  read: boolean;
  metadata: Record<string, unknown> | null;
  createdAt: string;
};
