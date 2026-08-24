import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import * as jose from 'jose';
import { db } from '../db/memoryStore.js';
import { config } from '../config.js';
import type { DevicePlatform, AuthTokens, UserProfile, DeviceInfo, PairDeviceRequest } from '@disciplineos/shared';

const secretKey = new TextEncoder().encode(config.jwtSecret);

export class AuthService {
  async register(email: string, password: string): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const normalizedEmail = email.toLowerCase().trim();

    for (const user of db.users.values()) {
      if (user.email === normalizedEmail) {
        throw new Error('User already exists with this email');
      }
    }

    const salt = await bcrypt.genSalt(10);
    const passwordHash = await bcrypt.hash(password, salt);
    const userId = randomUUID();
    const now = new Date().toISOString();

    const userRow = {
      id: userId,
      email: normalizedEmail,
      passwordHash,
      createdAt: now,
    };
    db.users.set(userId, userRow);

    // Initialize Time Bank
    db.timeBanks.set(userId, {
      userId,
      balanceSeconds: 0,
      maxSeconds: config.maxBalanceSeconds,
      lastDecayAt: now,
      updatedAt: now,
    });

    const tokens = await this.generateTokens(userId);
    return {
      user: { id: userId, email: normalizedEmail, createdAt: now },
      tokens,
    };
  }

  async login(email: string, password: string): Promise<{ user: UserProfile; tokens: AuthTokens }> {
    const normalizedEmail = email.toLowerCase().trim();

    let foundUser: typeof db.users extends Map<string, infer U> ? U | undefined : undefined;
    for (const user of db.users.values()) {
      if (user.email === normalizedEmail) {
        foundUser = user;
        break;
      }
    }

    if (!foundUser) {
      throw new Error('Invalid email or password');
    }

    const isValid = await bcrypt.compare(password, foundUser.passwordHash);
    if (!isValid) {
      throw new Error('Invalid email or password');
    }

    const tokens = await this.generateTokens(foundUser.id);
    return {
      user: { id: foundUser.id, email: foundUser.email, createdAt: foundUser.createdAt },
      tokens,
    };
  }

  async pairDevice(userId: string, data: PairDeviceRequest): Promise<DeviceInfo & { tokens: AuthTokens }> {
    const user = db.users.get(userId);
    if (!user) {
      throw new Error('User not found');
    }

    const deviceId = randomUUID();
    const now = new Date().toISOString();

    const deviceRow = {
      id: deviceId,
      userId,
      name: data.name,
      platform: data.platform,
      pushToken: data.pushToken ?? null,
      lastSeenAt: now,
      isEnforced: true,
      createdAt: now,
    };
    db.devices.set(deviceId, deviceRow);

    const tokens = await this.generateTokens(userId, deviceId);

    return {
      id: deviceId,
      userId,
      name: deviceRow.name,
      platform: deviceRow.platform,
      pushToken: deviceRow.pushToken,
      lastSeenAt: deviceRow.lastSeenAt,
      isEnforced: deviceRow.isEnforced,
      createdAt: deviceRow.createdAt,
      tokens,
    };
  }

  async getDevices(userId: string): Promise<DeviceInfo[]> {
    const devices: DeviceInfo[] = [];
    for (const device of db.devices.values()) {
      if (device.userId === userId) {
        devices.push({
          id: device.id,
          userId: device.userId,
          name: device.name,
          platform: device.platform,
          pushToken: device.pushToken,
          lastSeenAt: device.lastSeenAt,
          isEnforced: device.isEnforced,
          createdAt: device.createdAt,
        });
      }
    }
    return devices;
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

    return {
      accessToken: jwt,
      refreshToken,
      expiresInSeconds: config.jwtExpiresInSeconds,
    };
  }

  async verifyToken(token: string): Promise<{ userId: string; deviceId?: string }> {
    try {
      const { payload } = await jose.jwtVerify(token, secretKey);
      if (payload.type && payload.type !== 'access') {
        throw new Error('Unauthorized: Invalid token type (access token required)');
      }
      return {
        userId: payload.userId as string,
        deviceId: payload.deviceId as string | undefined,
      };
    } catch (err: any) {
      throw new Error(err.message || 'Invalid or expired token');
    }
  }

  async refreshToken(refreshTokenString: string): Promise<AuthTokens> {
    try {
      const { payload } = await jose.jwtVerify(refreshTokenString, secretKey);
      if (payload.type !== 'refresh') {
        throw new Error('Invalid token type: expected refresh token');
      }
      return this.generateTokens(payload.userId as string, payload.deviceId as string | undefined);
    } catch (err: any) {
      throw new Error(err.message || 'Invalid refresh token');
    }
  }
}

export const authService = new AuthService();
