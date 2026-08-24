const isProd = process.env.NODE_ENV === 'production';
const envSecret = process.env.JWT_SECRET;

if (isProd && !envSecret) {
  throw new Error('FATAL: JWT_SECRET environment variable is strictly required in production!');
}

export const config = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: envSecret || 'disciplineos-insecure-dev-secret-key-at-least-32-chars',
  jwtExpiresInSeconds: 60 * 60 * 24, // 24 hours access token
  maxBalanceSeconds: 60 * 60 * 4, // 4 hours cap
  defaultEmergencyMultiplier: 3.0, // Non-negotiable server-authoritative 3x multiplier
};
