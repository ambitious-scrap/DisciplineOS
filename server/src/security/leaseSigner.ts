import { createPrivateKey, sign } from 'node:crypto';
import type { LeasePayload, SignedLease } from '@disciplineos/shared';
import { config } from '../config.js';

function canonicalize(value: unknown): string {
  if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map((item) => canonicalize(item)).join(',')}]`;
  }
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${canonicalize(item)}`);
    return `{${entries.join(',')}}`;
  }
  throw new Error('Lease payload contains an unsupported value');
}

export class LeaseSigner {
  private readonly privateKey = createPrivateKey(config.leaseSigningPrivateKey);

  sign(payload: LeasePayload): SignedLease {
    const canonicalPayload = canonicalize(payload);
    const signature = sign(null, Buffer.from(canonicalPayload, 'utf8'), this.privateKey).toString('base64url');
    return {
      payload,
      canonicalPayload,
      signature,
      algorithm: 'Ed25519',
      keyId: config.leaseSigningKeyId,
    };
  }
}

export const leaseSigner = new LeaseSigner();
export { canonicalize as canonicalizeLeasePayload };
