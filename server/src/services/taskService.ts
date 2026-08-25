import { randomUUID } from 'node:crypto';
import type {
  CompleteTaskRequest,
  CreateTaskRequest,
  SubmitPhotoEvidenceRequest,
  Task,
  TaskOccurrence,
  TimeBankBalance,
} from '@disciplineos/shared';
import type { TaskOccurrenceRow, TaskRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';

function activityForTask(evidenceType: TaskRow['evidenceType']): 'manual' | 'photo' | 'focus' {
  return evidenceType === 'none' ? 'manual' : evidenceType === 'photo' ? 'photo' : 'focus';
}

export class TaskService {
  constructor(private readonly store: DisciplineStore) {}

  private toTask(task: TaskRow): Task {
    return {
      id: task.id,
      userId: task.userId,
      title: task.title,
      description: task.description,
      rewardSeconds: task.rewardSeconds,
      evidenceType: task.evidenceType,
      isRecurring: task.isRecurring,
      recurrenceCron: task.recurrenceCron,
      isActive: task.isActive,
      createdAt: task.createdAt,
    };
  }

  private toOccurrence(occurrence: TaskOccurrenceRow): TaskOccurrence {
    return {
      id: occurrence.id,
      taskId: occurrence.taskId,
      userId: occurrence.userId,
      occurrenceDate: occurrence.occurrenceDate,
      completedAt: occurrence.completedAt,
      evidenceUrl: occurrence.evidenceUrl,
      evidenceSha256: occurrence.evidenceSha256,
      evidenceSessionId: occurrence.evidenceSessionId,
      photoEvidenceId: occurrence.photoEvidenceId,
      rewardSeconds: occurrence.rewardSeconds ?? 0,
      rewardClaimed: occurrence.rewardClaimed,
      createdAt: occurrence.createdAt,
    };
  }

  async getTasks(userId: string): Promise<Task[]> {
    const tasks = await this.store.getTasks(userId);
    return tasks.map((task) => this.toTask(task));
  }

  async createTask(userId: string, request: CreateTaskRequest): Promise<Task> {
    const policy = await this.store.getRewardPolicy(userId, activityForTask(request.evidenceType));
    const task: TaskRow = {
      id: randomUUID(),
      userId,
      title: request.title,
      description: request.description ?? null,
      rewardSeconds: Math.max(60, policy.maxRewardSeconds),
      evidenceType: request.evidenceType,
      isRecurring: request.isRecurring,
      recurrenceCron: request.recurrenceCron ?? null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await this.store.createTask(task);
    return this.toTask(task);
  }

  async submitPhotoEvidence(
    userId: string,
    deviceId: string,
    taskId: string,
    request: SubmitPhotoEvidenceRequest,
  ) {
    return this.store.submitPhotoEvidence({
      id: randomUUID(),
      userId,
      deviceId,
      taskId,
      occurrenceDate: request.occurrenceDate,
      sha256: request.sha256,
      sourceUri: request.sourceUri ?? null,
      idempotencyKey: request.idempotencyKey,
    });
  }

  async completeTaskOccurrence(
    userId: string,
    taskId: string,
    deviceId: string | undefined,
    request: CompleteTaskRequest,
  ): Promise<{ occurrence: TaskOccurrence; balance: TimeBankBalance }> {
    const task = await this.store.getTask(userId, taskId);
    if (!task) throw new Error('Task not found');
    const evidenceDeviceRequired = task.evidenceType !== 'none';
    if (evidenceDeviceRequired && !deviceId) {
      throw new Error('Device-scoped access token required for evidence-backed tasks');
    }
    if (task.evidenceType === 'focus_timer' && !request.evidenceSessionId) {
      throw new Error('Completed verified focus session is required to complete this task');
    }
    if (task.evidenceType === 'photo' && !request.photoEvidenceId) {
      throw new Error('Server-registered photo evidence is required to complete this task');
    }
    const result = await this.store.completeTaskWithEvidence({
      id: randomUUID(),
      userId,
      deviceId: deviceId ?? null,
      taskId,
      occurrenceDate: request.occurrenceDate,
      focusSessionId: request.evidenceSessionId ?? null,
      photoEvidenceId: request.photoEvidenceId ?? null,
      idempotencyKey: request.idempotencyKey,
    });
    return { occurrence: this.toOccurrence(result.occurrence), balance: result.balance };
  }
}
