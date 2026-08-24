import { randomUUID } from 'node:crypto';
import { db } from '../db/memoryStore.js';
import { ledgerService } from './ledgerService.js';
import type {
  Task,
  TaskOccurrence,
  CreateTaskRequest,
  CompleteTaskRequest,
  TimeBankBalance,
} from '@disciplineos/shared';

export class TaskService {
  async getTasks(userId: string): Promise<Task[]> {
    const tasks: Task[] = [];
    for (const task of db.tasks.values()) {
      if (task.userId === userId && task.isActive) {
        tasks.push({ ...task });
      }
    }
    return tasks;
  }

  async createTask(userId: string, req: CreateTaskRequest): Promise<Task> {
    // Reward is capped between 60s and 3600s
    const rewardSeconds = Math.min(3600, Math.max(60, req.rewardSeconds));

    const id = randomUUID();
    const now = new Date().toISOString();

    const task: Task = {
      id,
      userId,
      title: req.title,
      description: req.description ?? null,
      rewardSeconds,
      evidenceType: req.evidenceType,
      isRecurring: req.isRecurring,
      recurrenceCron: req.recurrenceCron ?? null,
      isActive: true,
      createdAt: now,
    };

    db.tasks.set(id, task);
    return task;
  }

  async completeTaskOccurrence(
    userId: string,
    taskId: string,
    req: CompleteTaskRequest
  ): Promise<{ occurrence: TaskOccurrence; balance: TimeBankBalance }> {
    const task = db.tasks.get(taskId);
    if (!task || task.userId !== userId) {
      throw new Error('Task not found');
    }

    // Evidence Verification Gate
    if (task.evidenceType === 'photo') {
      if (!req.evidenceUrl && !req.evidenceSha256) {
        throw new Error('Photo proof (evidenceUrl or evidenceSha256) is strictly required to complete this task');
      }
    } else if (task.evidenceType === 'focus_timer') {
      if (!req.evidenceMeta || !req.evidenceMeta.sessionDurationSeconds) {
        throw new Error('Focus session telemetry is strictly required to complete this task');
      }
    }

    for (const occ of db.taskOccurrences.values()) {
      if (occ.taskId === taskId && occ.occurrenceDate === req.occurrenceDate && occ.rewardClaimed) {
        throw new Error('Reward has already been claimed for this task occurrence date');
      }
    }

    const now = new Date().toISOString();
    const occurrenceId = randomUUID();
    const occurrence: TaskOccurrence = {
      id: occurrenceId,
      taskId,
      userId,
      occurrenceDate: req.occurrenceDate,
      completedAt: now,
      evidenceUrl: req.evidenceUrl ?? null,
      evidenceSha256: req.evidenceSha256 ?? null,
      rewardClaimed: true,
      createdAt: now,
    };
    db.taskOccurrences.set(occurrenceId, occurrence);

    // Credit reward to the ledger internally
    const { newBalance } = await ledgerService.internalCreditPoints(userId, {
      source: 'task',
      seconds: task.rewardSeconds,
      description: `Completed task: ${task.title} (${req.occurrenceDate})`,
      idempotencyKey: req.idempotencyKey,
    });

    return { occurrence, balance: newBalance };
  }
}

export const taskService = new TaskService();
