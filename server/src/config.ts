const isProd = process.env.NODE_ENV === 'production';
const envSecret = process.env.JWT_SECRET;
const envLeaseSigningPrivateKey = process.env.LEASE_SIGNING_PRIVATE_KEY;

export function assertProductionSecrets(
  environment = process.env.NODE_ENV,
  jwtSecret = envSecret,
  leaseSigningPrivateKey = envLeaseSigningPrivateKey,
): void {
  if (environment === 'production' && !jwtSecret) {
    throw new Error('FATAL: JWT_SECRET environment variable is strictly required in production!');
  }
  if (environment === 'production' && !leaseSigningPrivateKey) {
    throw new Error('FATAL: LEASE_SIGNING_PRIVATE_KEY environment variable is strictly required in production!');
  }
}

assertProductionSecrets();
// This fixture is intentionally development-only. Production must provide a stable
// externally managed key so existing signed capabilities remain verifiable after restart.
const developmentLeaseSigningPrivateKey = `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEIEjdXY01TKzJI1yhkrPollUCDL+UFaW/ZSRIihcw/JmU
-----END PRIVATE KEY-----`;

export const config = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: envSecret || 'disciplineos-insecure-dev-secret-key-at-least-32-chars',
  jwtExpiresInSeconds: 60 * 60 * 24, // 24 hours access token
  maxBalanceSeconds: 60 * 60 * 4, // 4 hours cap
  defaultEmergencyMultiplier: 3.0, // Non-negotiable server-authoritative 3x multiplier
  leaseSigningPrivateKey: envLeaseSigningPrivateKey || developmentLeaseSigningPrivateKey,
  leaseSigningKeyId: process.env.LEASE_SIGNING_KEY_ID || 'server-lease-v1',
};
