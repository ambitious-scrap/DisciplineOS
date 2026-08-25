import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { config } from '../config.js';
import type { AuthTokens, UserProfile, DeviceInfo, PairDeviceRequest } from '@disciplineos/shared';
import type { DeviceRow, UserRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';

const secretKey = new TextEncoder().encode(config.jwtSecret);

export class AuthService {
  constructor(private readonly store: DisciplineStore) {}

  async register(email: string, password: string): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const normalizedEmail = email.toLowerCase().trim();
    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = randomUUID();
    const now = new Date().toISOString();
    const user: UserRow = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      createdAt: now,
    };
    await this.store.registerUser(user, {
      userId,
      balanceSeconds: 0,
      maxSeconds: config.maxBalanceSeconds,
      lastDecayAt: now,
      updatedAt: now,
    });
    return {
      user: { id: userId, email: normalizedEmail, createdAt: now },
      tokens: await this.generateTokens(userId),
    };
  }

  async login(email: string, password: string): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const normalizedEmail = email.toLowerCase().trim();
    const user = await this.store.getUserByEmail(normalizedEmail);
    if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
      throw new Error('Invalid email or password');
    }
    return {
      user: { id: user.id, email: user.email, createdAt: user.createdAt },
      tokens: await this.generateTokens(user.id),
    };
  }

  async pairDevice(userId: string, data: PairDeviceRequest): Promise<DeviceInfo & { tokens: AuthTokens }> {
    const user = await this.store.getUserById(userId);
    if (!user) throw new Error('User not found');
    const deviceId = randomUUID();
    const now = new Date().toISOString();
    const device: DeviceRow = {
      id: deviceId,
      userId,
      name: data.name,
      platform: data.platform,
      pushToken: data.pushToken ?? null,
      lastSeenAt: now,
      isEnforced: true,
      createdAt: now,
    };
    await this.store.createDevice(device);
    return {
      ...device,
      tokens: await this.generateTokens(userId, deviceId),
    };
  }

  async getDevices(userId: string): Promise<DeviceInfo[]> {
    return this.store.getDevices(userId);
  }

  async generateTokens(userId: string, deviceId?: string): Promise<AuthTokens> {
    const jwt = await new jose.SignJWT({ userId, deviceId, type: 'access' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime(`${config.jwtExpiresInSeconds}s`)
      .sign(secretKey);
    const refreshToken = await new jose.SignJWT({ userId, deviceId, type: 'refresh' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('30d')
      .sign(secretKey);
    return { accessToken: jwt, refreshToken, expiresInSeconds: config.jwtExpiresInSeconds };
  }

  async verifyToken(token: string): Promise<{ userId: string; deviceId?: string }> {
    try {
      const { payload } = await jose.jwtVerify(token, secretKey);
      if (payload.type !== 'access' || typeof payload.userId !== 'string') {
        throw new Error('Unauthorized: Invalid token type (access token required)');
      }
      return {
        userId: payload.userId,
        deviceId: typeof payload.deviceId === 'string' ? payload.deviceId : undefined,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid or expired token';
      throw new Error(message);
    }
  }

  async refreshToken(refreshTokenString: string): Promise<AuthTokens> {
    try {
      const { payload } = await jose.jwtVerify(refreshTokenString, secretKey);
      if (payload.type !== 'refresh' || typeof payload.userId !== 'string') {
        throw new Error('Invalid token type: expected refresh token');
      }
      return this.generateTokens(
        payload.userId,
        typeof payload.deviceId === 'string' ? payload.deviceId : undefined,
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Invalid refresh token';
      throw new Error(message);
    }
  }
}
