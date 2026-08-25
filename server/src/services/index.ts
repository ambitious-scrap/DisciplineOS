import type { DisciplineStore } from '../db/store.js';
import { AuditService } from './auditService.js';
import { AuthService } from './authService.js';
import { FocusService } from './focusService.js';
import { LedgerService } from './ledgerService.js';
import { PolicyService } from './policyService.js';
import { ReserveService } from './reserveService.js';
import { RewardPolicyService } from './rewardPolicyService.js';
import { SessionService } from './sessionService.js';
import { TaskService } from './taskService.js';

export interface Services {
  auth: AuthService;
  ledger: LedgerService;
  sessions: SessionService;
  focus: FocusService;
  policy: PolicyService;
  rewardPolicies: RewardPolicyService;
  tasks: TaskService;
  reserves: ReserveService;
  audit: AuditService;
}

export function createServices(store: DisciplineStore): Services {
  return {
    auth: new AuthService(store),
    ledger: new LedgerService(store),
    sessions: new SessionService(store),
    focus: new FocusService(store),
    policy: new PolicyService(store),
    rewardPolicies: new RewardPolicyService(store),
    tasks: new TaskService(store),
    reserves: new ReserveService(store),
    audit: new AuditService(store),
  };
}
