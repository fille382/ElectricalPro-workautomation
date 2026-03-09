import { useState } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import type { Job } from '../types';

interface JobFormProps {
  job?: Job;
  onSubmit: (data: Omit<Job, 'id' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
}

export default function JobForm({ job, onSubmit, onCancel }: JobFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: job?.name || '',
    address: job?.address || '',
    description: job?.description || '',
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert(t('jobForm.nameRequired'));
      return;
    }
    onSubmit({
      ...formData,
      status: job?.status || 'active',
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label-text">{t('jobForm.jobName')}</label>
        <input
          type="text"
          className="input-field"
          placeholder={t('jobForm.jobNamePlaceholder')}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          required
        />
      </div>

      <div>
        <label className="label-text">{t('jobForm.address')}</label>
        <input
          type="text"
          className="input-field"
          placeholder={t('jobForm.addressPlaceholder')}
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>

      <div>
        <label className="label-text">{t('jobForm.description')}</label>
        <textarea
          className="textarea-field"
          rows={3}
          placeholder={t('jobForm.descriptionPlaceholder')}
          value={formData.description}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
        />
      </div>

      <div className="flex gap-3 pt-4">
        <button type="submit" className="btn-primary flex-1">
          {job ? t('jobForm.updateJob') : t('jobForm.createJob')}
        </button>
        <button type="button" onClick={onCancel} className="btn-secondary flex-1">
          {t('jobForm.cancel')}
        </button>
      </div>
    </form>
  );
}
