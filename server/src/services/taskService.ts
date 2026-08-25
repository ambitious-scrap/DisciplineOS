import { randomUUID } from 'node:crypto';
import type {
  CompleteTaskRequest,
  CreateTaskRequest,
  Task,
  TaskOccurrence,
  TimeBankBalance,
} from '@disciplineos/shared';
import { MAX_NO_EVIDENCE_REWARD_SECONDS } from '@disciplineos/shared';
import type { TaskOccurrenceRow, TaskRow } from '../db/interfaces.js';
import type { DisciplineStore } from '../db/store.js';
function taskRewardSeconds(request: CreateTaskRequest): number {
  const bounded = Math.min(3600, Math.max(60, request.rewardSeconds));
  return request.evidenceType === 'none'
    ? Math.min(MAX_NO_EVIDENCE_REWARD_SECONDS, bounded)
    : bounded;
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
      rewardClaimed: occurrence.rewardClaimed,
      createdAt: occurrence.createdAt,
    };
  }

  async getTasks(userId: string): Promise<Task[]> {
    const tasks = await this.store.getTasks(userId);
    return tasks.map((task) => this.toTask(task));
  }
  async createTask(userId: string, request: CreateTaskRequest): Promise<Task> {
    const rewardSeconds = taskRewardSeconds(request);
    const task: TaskRow = {
      id: randomUUID(),
      userId,
      title: request.title,
      description: request.description ?? null,
      rewardSeconds,
      evidenceType: request.evidenceType,
      isRecurring: request.isRecurring,
      recurrenceCron: request.recurrenceCron ?? null,
      isActive: true,
      createdAt: new Date().toISOString(),
    };
    await this.store.createTask(task);
    return this.toTask(task);
  }

  async completeTaskOccurrence(
    userId: string,
    taskId: string,
    request: CompleteTaskRequest,
  ): Promise<{ occurrence: TaskOccurrence; balance: TimeBankBalance }> {
    const task = await this.store.getTask(userId, taskId);
    if (!task) throw new Error('Task not found');
    if (task.evidenceType === 'photo' && !request.evidenceUrl && !request.evidenceSha256) {
      throw new Error('Photo proof (evidenceUrl or evidenceSha256) is strictly required to complete this task');
    }
    if (task.evidenceType === 'focus_timer' && !request.evidenceMeta?.sessionDurationSeconds) {
      throw new Error('Focus session telemetry is strictly required to complete this task');
    }

    const now = new Date().toISOString();
    const occurrence: TaskOccurrenceRow = {
      id: randomUUID(),
      taskId,
      userId,
      occurrenceDate: request.occurrenceDate,
      completedAt: now,
      evidenceUrl: request.evidenceUrl ?? null,
      evidenceSha256: request.evidenceSha256 ?? null,
      rewardClaimed: true,
      createdAt: now,
      idempotencyKey: request.idempotencyKey,
    };
    const result = await this.store.completeTaskOccurrence(userId, taskId, occurrence, {
      source: 'task',
      seconds: task.rewardSeconds,
      description: `Completed task: ${task.title} (${request.occurrenceDate})`,
      idempotencyKey: request.idempotencyKey,
    });
    return { occurrence: this.toOccurrence(result.occurrence), balance: result.balance };
  }
}
