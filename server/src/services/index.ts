import type { DisciplineStore } from '../db/store.js';
import { AuditService } from './auditService.js';
import { AuthService } from './authService.js';
import { LedgerService } from './ledgerService.js';
import { PolicyService } from './policyService.js';
import { ReserveService } from './reserveService.js';
import { SessionService } from './sessionService.js';
import { TaskService } from './taskService.js';

export interface Services {
  auth: AuthService;
  ledger: LedgerService;
  sessions: SessionService;
  policy: PolicyService;
  tasks: TaskService;
  reserves: ReserveService;
  audit: AuditService;
}

export function createServices(store: DisciplineStore): Services {
  return {
    auth: new AuthService(store),
    ledger: new LedgerService(store),
    sessions: new SessionService(store),
    policy: new PolicyService(store),
    tasks: new TaskService(store),
    reserves: new ReserveService(store),
    audit: new AuditService(store),
  };
}
