export const config = {
  port: Number(process.env.PORT) || 3000,
  jwtSecret: process.env.JWT_SECRET || 'disciplineos-insecure-dev-secret-key-at-least-32-chars',
  jwtExpiresInSeconds: 60 * 60 * 24 * 7, // 7 days
  maxBalanceSeconds: 60 * 60 * 4, // 4 hours cap
  defaultEmergencyMultiplier: 3.0,
};
