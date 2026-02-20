import { TaskWorkAssignment } from '../TaskWorkAssignment.js';
import mongoose from 'mongoose';

interface TaskLean {
  id?: string;
  project_id?: string;
}

interface SubtaskLean {
  id?: string;
}

export function registerTaskHooks(taskSchema: { post: Function }): void {
  taskSchema.post('findOneAndUpdate', async function (doc: TaskLean | null) {
    if (!doc?.id) return;
    const updated = (await mongoose.model('Task').findOne({ id: doc.id }).lean().exec()) as TaskLean | null;
    const projectId = updated?.project_id ?? doc?.project_id;
    if (!projectId) return;

    await TaskWorkAssignment.updateMany(
      { task_id: doc.id, task_type: 'task' },
      { $set: { project_id: projectId } }
    ).exec();

    const Subtask = mongoose.model('Subtask');
    const subtasks = (await Subtask.find({ task_id: doc.id }).select('id').lean().exec()) as SubtaskLean[];
    const subtaskIds = subtasks.map((s) => s.id).filter(Boolean);
    if (subtaskIds.length > 0) {
      await TaskWorkAssignment.updateMany(
        { task_id: { $in: subtaskIds }, task_type: 'subtask' },
        { $set: { project_id: projectId } }
      ).exec();
    }
  });
}
