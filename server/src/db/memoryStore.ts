import { randomUUID } from 'node:crypto';
import type {
  UserRow,
  DeviceRow,
  TimeBankRow,
  TransactionRow,
  TaskRow,
  TaskOccurrenceRow,
  BlockedAppRow,
  BlockedSiteRow,
  ActiveUnlockRow,
  DeviceReserveRow,
  OfflineEventRow,
  ProtectionEventRow,
  LocationEventRow,
} from './interfaces.js';

export class MemoryStore {
  users: Map<string, UserRow> = new Map();
  devices: Map<string, DeviceRow> = new Map();
  timeBanks: Map<string, TimeBankRow> = new Map(); // keyed by userId
  transactions: TransactionRow[] = []; // immutable append-only ledger
  tasks: Map<string, TaskRow> = new Map();
  taskOccurrences: Map<string, TaskOccurrenceRow> = new Map(); // id -> row
  blockedApps: Map<string, BlockedAppRow> = new Map();
  blockedSites: Map<string, BlockedSiteRow> = new Map();
  activeUnlocks: Map<string, ActiveUnlockRow> = new Map();
  deviceReserves: Map<string, DeviceReserveRow> = new Map();
  offlineEvents: Map<string, OfflineEventRow> = new Map();
  protectionEvents: ProtectionEventRow[] = [];
  locationEvents: LocationEventRow[] = [];

  clear() {
    this.users.clear();
    this.devices.clear();
    this.timeBanks.clear();
    this.transactions = [];
    this.tasks.clear();
    this.taskOccurrences.clear();
    this.blockedApps.clear();
    this.blockedSites.clear();
    this.activeUnlocks.clear();
    this.deviceReserves.clear();
    this.offlineEvents.clear();
    this.protectionEvents = [];
    this.locationEvents = [];
  }
}

export const db = new MemoryStore();
