import { z } from 'zod';

export interface DeviceReserve {
  id: string;
  userId: string;
  deviceId: string;
  reservedSeconds: number;
  remainingSeconds: number;
  expiresAt: string;
  createdAt: string;
}

export const AllocateReserveSchema = z.object({
  deviceId: z.string().uuid(),
  requestedSeconds: z.number().int().min(300).max(7200), // 5m to 2h
  ttlSeconds: z.number().int().min(1800).max(86400).default(43200), // 30m to 24h, default 12h
  idempotencyKey: z.string().min(8).max(128),
});
export type AllocateReserveRequest = z.infer<typeof AllocateReserveSchema>;

export const OfflineSpendEventSchema = z.object({
  eventId: z.string().uuid(),
  deviceId: z.string().uuid(),
  targetType: z.enum(['app', 'site']),
  targetIdentifier: z.string().min(1),
  secondsSpent: z.number().int().positive(),
  localTimestamp: z.string(),
  isEmergency: z.boolean().default(false),
});
export type OfflineSpendEvent = z.infer<typeof OfflineSpendEventSchema>;

export const ReconcileReservesSchema = z.object({
  deviceId: z.string().uuid(),
  reserveId: z.string().uuid(),
  events: z.array(OfflineSpendEventSchema),
});
export type ReconcileReservesRequest = z.infer<typeof ReconcileReservesSchema>;

export interface ReconcileReservesResponse {
  reconciledCount: number;
  acceptedSeconds: number;
  releasedUnusedSeconds: number;
  newBalanceSeconds: number;
}
