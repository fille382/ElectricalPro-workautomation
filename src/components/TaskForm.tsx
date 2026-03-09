import { useState } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import type { Task } from '../types';

interface TaskFormProps {
  jobId: string;
  task?: Task;
  onSubmit: (data: Omit<Task, 'id' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
}

export default function TaskForm({ jobId, task, onSubmit, onCancel }: TaskFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    title: task?.title || '',
    description: task?.description || '',
    notes: task?.notes || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title.trim()) {
      alert(t('taskForm.titleRequired'));
      return;
    }
    onSubmit({
      job_id: jobId,
      title: formData.title,
      description: formData.description,
      notes: formData.notes,
      status: task?.status || 'pending',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label-text">{t('taskForm.taskTitle')}</label>
        <input
          type="text"
          className="input-field"
          placeholder={t('taskForm.taskTitlePlaceholder')}
          value={formData.title}
          onChange={(e) => setFormData({ ...formData, title: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label-text">{t('taskForm.description')}</label>
        <textarea
          className="textarea-field"
          rows={2}
          placeholder={t('taskForm.descriptionPlaceholder')}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div>
        <label className="label-text">{t('taskForm.notes')}</label>
        <textarea
          className="textarea-field"
          rows={2}
          placeholder={t('taskForm.notesPlaceholder')}
          value={formData.notes}
          onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1">
          {task ? t('taskForm.updateTask') : t('taskForm.addTask')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          {t('taskForm.cancel')}
        </button>
      </div>
    </form>
  );
}
