import { z } from 'zod';

export const UnlockTypeSchema = z.enum(['app', 'site', 'focus']);
export type UnlockType = z.infer<typeof UnlockTypeSchema>;

export interface LeasePayload {
  version: 1;
  leaseId: string;
  userId: string;
  deviceId: string;
  targetType: UnlockType;
  targetIdentifier: string;
  issuedAt: string;
  expiresAt: string;
  durationSeconds: number;
  isEmergency: boolean;
  policyVersion: number;
  nonce: string;
}

export interface SignedLease {
  payload: LeasePayload;
  canonicalPayload: string;
  signature: string;
  algorithm: 'Ed25519';
  keyId: string;
}

export interface ActiveUnlockSession {
  id: string;
  userId: string;
  deviceId: string;
  unlockType: UnlockType;
  identifier: string; // package name or domain or 'focus'
  durationSeconds: number;
  startedAt: string;
  expiresAt: string;
  isEmergency: boolean;
  /** Legacy alias retained for older clients; new clients verify lease.signature. */
  leaseSignature: string;
  lease: SignedLease | null;
}


export const ReleaseSessionSchema = z.object({
  sessionId: z.string().uuid(),
  deviceId: z.string().uuid(),
});
export type ReleaseSessionRequest = z.infer<typeof ReleaseSessionSchema>;
