import { z } from 'zod';

export const ProtectionDegradedTypeSchema = z.enum([
  'vpn_disconnected',
  'accessibility_disabled',
  'usage_stats_revoked',
  'overlay_permission_revoked',
  'service_killed',
  'clock_rollback_detected',
  'mac_daemon_stopped',
  'mac_extension_disabled',
  'device_owner_lost',
  'policy_stale',
  'policy_sync_failed',
  'auth_refresh_failed',
  'clock_changed',
  'invalid_lease_signature',
  'lease_device_mismatch',
  'lease_target_mismatch',
  'enforcement_reconciliation_failed',
  'app_unexpectedly_unsuspended',
  'protection_restored',
]);
export type ProtectionDegradedType = z.infer<typeof ProtectionDegradedTypeSchema>;

export const ReportProtectionEventSchema = z.object({
  deviceId: z.string().uuid(),
  eventType: ProtectionDegradedTypeSchema,
  details: z.record(z.unknown()).optional(),
  occurredAt: z.string(),
});
export type ReportProtectionEventRequest = z.infer<typeof ReportProtectionEventSchema>;

export const LocationEventTypeSchema = z.enum(['enter', 'exit', 'dwell']);
export type LocationEventType = z.infer<typeof LocationEventTypeSchema>;

export const MovementTelemetrySchema = z.object({
  stepDelta: z.number().int().min(0).max(200_000),
  activeSeconds: z.number().int().min(0).max(86_400),
  sampleCount: z.number().int().min(0).max(100_000),
  monotonicDurationMs: z.number().int().nonnegative().optional(),
}).strict();
export type MovementTelemetry = z.infer<typeof MovementTelemetrySchema>;

export const ReportLocationEventSchema = z.object({
  locationType: z.enum(['home', 'gym', 'custom']),
  placeIdentifier: z.string().min(1).max(128).default('default'),
  eventType: LocationEventTypeSchema,
  movement: MovementTelemetrySchema.optional(),
  clientOccurredAt: z.string().datetime().optional(),
  clientMonotonicMs: z.number().int().nonnegative().optional(),
  idempotencyKey: z.string().min(8).max(128),
}).strict();
export type ReportLocationEventRequest = z.infer<typeof ReportLocationEventSchema>;
