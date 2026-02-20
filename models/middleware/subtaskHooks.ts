import mongoose from 'mongoose';
import { Task } from '../Task.js';
import { TaskWorkAssignment } from '../TaskWorkAssignment.js';

async function syncTaskFromSubtasks(taskId: string): Promise<void> {
  const Subtask = mongoose.model('Subtask');
  const subtasks = await Subtask.find({ task_id: taskId }).lean().exec();
  const assignedUsers = [...new Set(subtasks.map((s: { assigned_to: string }) => s.assigned_to))];
  const estimatedDuration = subtasks.reduce((sum: number, s: { estimated_duration: number }) => sum + s.estimated_duration, 0);

  await Task.updateOne(
    { id: taskId },
    { $set: { assigned_users: assignedUsers, estimated_duration: estimatedDuration } }
  ).exec();

  const userIds = new Set(assignedUsers);
  await TaskWorkAssignment.deleteMany({
    task_id: taskId,
    task_type: 'task',
    user_id: { $nin: Array.from(userIds) },
  }).exec();
}

async function updateParentTaskStatus(taskId: string): Promise<void> {
  const Subtask = mongoose.model('Subtask');
  const subtasks = await Subtask.find({ task_id: taskId }).lean().exec();
  const allCompleted = subtasks.length > 0 && subtasks.every(
    (s: { status: string }) => s.status === 'completed' || s.status === 'approved'
  );
  const anyInProgress = subtasks.some(
    (s: { status: string }) => s.status === 'in_progress' || s.status === 'assigned'
  );

  if (allCompleted) {
    await Task.updateOne(
      { id: taskId },
      { $set: { status: 'in_review' } }
    ).exec();
  } else if (anyInProgress) {
    await Task.updateOne(
      { id: taskId, status: 'pending' },
      { $set: { status: 'in_progress' } }
    ).exec();
  }
}

export function registerSubtaskHooks(subtaskSchema: { post: Function }): void {
  subtaskSchema.post('save', async function (doc: { task_id: string }) {
    if (doc?.task_id) {
      await syncTaskFromSubtasks(doc.task_id);
      await updateParentTaskStatus(doc.task_id);
    }
  });

  subtaskSchema.post('findOneAndDelete', async function (doc: { task_id?: string } | null) {
    if (doc?.task_id) {
      await syncTaskFromSubtasks(doc.task_id);
    }
  });

}
