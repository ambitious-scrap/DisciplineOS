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
    const id = randomUUID();
    const now = new Date().toISOString();

    const task: Task = {
      id,
      userId,
      title: req.title,
      description: req.description ?? null,
      rewardSeconds: req.rewardSeconds,
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

    const occurrenceKey = `${taskId}:${req.occurrenceDate}`;
    let occurrence: TaskOccurrence | undefined;

    for (const occ of db.taskOccurrences.values()) {
      if (occ.taskId === taskId && occ.occurrenceDate === req.occurrenceDate) {
        occurrence = occ;
        break;
      }
    }

    const now = new Date().toISOString();

    if (occurrence) {
      if (occurrence.rewardClaimed) {
        throw new Error('Reward has already been claimed for this task occurrence');
      }
      occurrence.completedAt = now;
      occurrence.evidenceUrl = req.evidenceUrl ?? null;
      occurrence.rewardClaimed = true;
    } else {
      const occurrenceId = randomUUID();
      occurrence = {
        id: occurrenceId,
        taskId,
        userId,
        occurrenceDate: req.occurrenceDate,
        completedAt: now,
        evidenceUrl: req.evidenceUrl ?? null,
        rewardClaimed: true,
        createdAt: now,
      };
      db.taskOccurrences.set(occurrenceId, occurrence);
    }

    // Credit reward to the ledger atomically
    const { newBalance } = await ledgerService.earnPoints(userId, {
      source: 'task',
      seconds: task.rewardSeconds,
      description: `Completed task: ${task.title} (${req.occurrenceDate})`,
      idempotencyKey: req.idempotencyKey,
    });

    return { occurrence, balance: newBalance };
  }
}

export const taskService = new TaskService();
