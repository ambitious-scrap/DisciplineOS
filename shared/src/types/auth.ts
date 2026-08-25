import { z } from 'zod';

export const DevicePlatformSchema = z.enum(['android', 'macos']);
export type DevicePlatform = z.infer<typeof DevicePlatformSchema>;

export const RegisterUserSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type RegisterUserRequest = z.infer<typeof RegisterUserSchema>;

export const LoginUserSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});
export type LoginUserRequest = z.infer<typeof LoginUserSchema>;

export const RefreshTokenSchema = z.object({
  refreshToken: z.string().min(1),
});
export type RefreshTokenRequest = z.infer<typeof RefreshTokenSchema>;

export const PairDeviceSchema = z.object({
  name: z.string().min(1).max(100),
  platform: DevicePlatformSchema,
  pushToken: z.string().optional(),
  pairingCode: z.string().optional(),
});
export type PairDeviceRequest = z.infer<typeof PairDeviceSchema>;

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
}

export interface UserProfile {
  id: string;
  email: string;
  createdAt: string;
}

export interface DeviceInfo {
  id: string;
  userId: string;
  name: string;
  platform: DevicePlatform;
  pushToken?: string | null;
  lastSeenAt: string;
  isEnforced: boolean;
  createdAt: string;
}
