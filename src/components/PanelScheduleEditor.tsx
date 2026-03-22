import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from '../contexts/I18nContext';
import { analyzePanelSchedule } from '../utils/claude';
import { getSettings } from '../utils/db';
import type { PanelSchedule, PanelScheduleRow, JobContact } from '../types';

interface PanelScheduleEditorProps {
  schedules: PanelSchedule[];
  jobId: string;
  apiKey: string | null;
  contacts?: JobContact[];
  onAdd: (data: Omit<PanelSchedule, 'id' | 'created_at' | 'updated_at'>) => Promise<any>;
  onUpdate: (id: string, updates: Partial<PanelSchedule>) => Promise<void>;
  onDelete: (id: string) => Promise<void>;
}

function makeRowId() {
  return `row_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function emptyRow(groupNumber: number): PanelScheduleRow {
  return { id: makeRowId(), group_number: groupNumber, description: '', module_number: '', rated_current: '', conductor_size: '' };
}

export default function PanelScheduleEditor({ schedules, jobId, apiKey, contacts = [], onAdd, onUpdate, onDelete }: PanelScheduleEditorProps) {
  const { t, language } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(schedules[0]?.id || null);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [analyzing, setAnalyzing] = useState(false);
  const [editCell, setEditCell] = useState<{ scheduleId: string; rowId: string; field: string } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [photoTargetScheduleId, setPhotoTargetScheduleId] = useState<string | null>(null);
  const [companyLogo, setCompanyLogo] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    getSettings().then((s) => {
      setCompanyLogo(s.company_logo || null);
      setCompanyName(s.company_name || '');
    });
  }, []);

  const handleCreate = async () => {
    if (!newName.trim()) return;
    // Auto-fill "Vid fel ring" with electrician contact from job
    const electrician = contacts.find((c) => c.role?.toLowerCase().includes('elekt') || c.role?.toLowerCase().includes('electric'));
    const faultContact = electrician ? `${electrician.name}${electrician.phone ? ` ${electrician.phone}` : ''}` : '';
    const schedule = await onAdd({
      job_id: jobId,
      name: newName.trim(),
      rows: Array.from({ length: 20 }, (_, i) => emptyRow(i + 1)),
      fault_contact: faultContact,
    });
    setNewName('');
    setShowCreate(false);
    setExpandedId(schedule.id);
  };

  const updateRow = (scheduleId: string, rowId: string, field: string, value: string | number) => {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return;
    const rows = schedule.rows.map((r) => (r.id === rowId ? { ...r, [field]: value } : r));
    onUpdate(scheduleId, { rows });
  };

  const addRow = (scheduleId: string) => {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return;
    const nextNum = schedule.rows.length > 0 ? Math.max(...schedule.rows.map((r) => r.group_number)) + 1 : 1;
    onUpdate(scheduleId, { rows: [...schedule.rows, emptyRow(nextNum)] });
  };

  const deleteRow = (scheduleId: string, rowId: string) => {
    const schedule = schedules.find((s) => s.id === scheduleId);
    if (!schedule) return;
    onUpdate(scheduleId, { rows: schedule.rows.filter((r) => r.id !== rowId) });
  };

  const handlePhotoAnalysis = async (scheduleId: string | null, file: File) => {
    if (!apiKey) return;
    setAnalyzing(true);
    try {
      const result = await analyzePanelSchedule(file, apiKey, language);
      const rows: PanelScheduleRow[] = result.rows.map((r: any, i: number) => ({
        id: makeRowId(),
        group_number: r.group_number || i + 1,
        description: r.description || r.gruppen_omfattar || '',
        module_number: r.module_number || r.modul_nr || '',
        rated_current: r.rated_current || r.breaker_size || r.markstrom || '',
        conductor_size: r.conductor_size || r.cable_type || r.ledarantal || '',
      }));

      if (scheduleId) {
        const schedule = schedules.find((s) => s.id === scheduleId);
        if (schedule) {
          onUpdate(scheduleId, { rows });
        }
      } else {
        const newSchedule = await onAdd({
          job_id: jobId,
          name: result.name || 'Gruppförteckning',
          rows,
          fault_contact: result.fault_contact || '',
        });
        setExpandedId(newSchedule.id);
      }
    } catch (err) {
      console.error('Panel schedule analysis failed:', err);
    } finally {
      setAnalyzing(false);
      setPhotoTargetScheduleId(null);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handlePhotoAnalysis(photoTargetScheduleId, file);
    e.target.value = '';
  };

  const handlePrint = (schedule: PanelSchedule) => {
    document.body.setAttribute('data-print-schedule', schedule.id);
    window.print();
    document.body.removeAttribute('data-print-schedule');
  };

  const renderCell = (schedule: PanelSchedule, row: PanelScheduleRow, field: keyof PanelScheduleRow, wide = false) => {
    const isEditing = editCell?.scheduleId === schedule.id && editCell?.rowId === row.id && editCell?.field === field;
    const value = String(row[field]);

    if (isEditing) {
      return (
        <input
          autoFocus
          className="w-full bg-transparent border-b border-blue-400 outline-none text-sm px-1 py-0.5"
          defaultValue={value}
          onBlur={(e) => {
            updateRow(schedule.id, row.id, field, field === 'group_number' ? parseInt(e.target.value) || 0 : e.target.value);
            setEditCell(null);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
            if (e.key === 'Escape') setEditCell(null);
            if (e.key === 'Tab') {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
              // Move to next editable field
              const fields: (keyof PanelScheduleRow)[] = ['group_number', 'description', 'module_number', 'rated_current', 'conductor_size'];
              const idx = fields.indexOf(field);
              if (idx < fields.length - 1) {
                setEditCell({ scheduleId: schedule.id, rowId: row.id, field: fields[idx + 1] });
              } else {
                // Move to next row's first field
                const rowIdx = schedule.rows.findIndex((r) => r.id === row.id);
                if (rowIdx < schedule.rows.length - 1) {
                  setEditCell({ scheduleId: schedule.id, rowId: schedule.rows[rowIdx + 1].id, field: 'group_number' });
                }
              }
            }
          }}
        />
      );
    }

    return (
      <span
        className={`cursor-pointer hover:bg-blue-500/10 px-1 py-0.5 rounded block min-h-[1.5em] ${wide ? '' : 'text-center'}`}
        onClick={() => setEditCell({ scheduleId: schedule.id, rowId: row.id, field })}
      >
        {value || '\u00A0'}
      </span>
    );
  };

  return (
    <div>
      <input ref={fileInputRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />

      {analyzing && (
        <div className="card text-center py-8 mb-4">
          <div className="animate-spin w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full mx-auto mb-3" />
          <p className="text-gray-500 dark:text-gray-400">{t('panel.analyzing')}</p>
        </div>
      )}

      {schedules.length === 0 && !showCreate && !analyzing && (
        <div className="card text-center py-12">
          <svg className="w-16 h-16 text-gray-300 dark:text-gray-600 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <p className="text-gray-500 dark:text-gray-400 mb-4">{t('panel.noSchedules')}</p>
          <div className="flex gap-2 justify-center">
            <button onClick={() => setShowCreate(true)} className="btn-primary text-sm">
              {t('panel.addSchedule')}
            </button>
            {apiKey && (
              <button
                onClick={() => { setPhotoTargetScheduleId(null); fileInputRef.current?.click(); }}
                className="btn-secondary text-sm"
              >
                {t('panel.fillFromPhoto')}
              </button>
            )}
          </div>
        </div>
      )}

      {showCreate && (
        <div className="card mb-4">
          <div className="flex gap-2">
            <input
              autoFocus
              className="input flex-1"
              placeholder={t('panel.scheduleName')}
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreate(false); }}
            />
            <button onClick={handleCreate} className="btn-primary text-sm">{t('panel.addSchedule')}</button>
            <button onClick={() => setShowCreate(false)} className="text-gray-400 hover:text-gray-600 px-2">&times;</button>
          </div>
        </div>
      )}

      {schedules.map((schedule) => (
        <div key={schedule.id} className="card mb-4 !p-0 overflow-hidden" id={`panel-schedule-${schedule.id}`}>
          {/* Header */}
          <div
            className="flex items-center justify-between p-3 cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
            onClick={() => setExpandedId(expandedId === schedule.id ? null : schedule.id)}
          >
            <div className="flex items-center gap-2">
              <svg className={`w-4 h-4 transition-transform ${expandedId === schedule.id ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
              <span className="font-semibold">{schedule.name}</span>
              <span className="text-sm text-gray-500">({schedule.rows.length} grupper)</span>
            </div>
            <div className="flex gap-1" onClick={(e) => e.stopPropagation()}>
              <button onClick={() => handlePrint(schedule)} className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600" title={t('panel.print')}>
                🖨️
              </button>
              {apiKey && (
                <button
                  onClick={() => { setPhotoTargetScheduleId(schedule.id); fileInputRef.current?.click(); }}
                  className="text-xs px-2 py-1 rounded bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600"
                  title={t('panel.fillFromPhoto')}
                >
                  📷
                </button>
              )}
              <button
                onClick={() => { if (confirm(t('panel.deleteSchedule') + '?')) onDelete(schedule.id); }}
                className="text-xs px-2 py-1 rounded bg-red-100 dark:bg-red-900/30 text-red-600 hover:bg-red-200 dark:hover:bg-red-900/50"
              >
                🗑️
              </button>
            </div>
          </div>

          {/* Print header with company logo — hidden in app, visible in print */}
          {(companyLogo || companyName) && (
            <div className="hidden print-company-header" style={{ display: 'none' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', padding: '0 0 12px 0', borderBottom: '2px solid #333' }}>
                {companyLogo && <img src={companyLogo} alt="" style={{ height: '48px', width: 'auto', objectFit: 'contain' }} />}
                {companyName && <span style={{ fontSize: '14pt', fontWeight: 'bold' }}>{companyName}</span>}
              </div>
            </div>
          )}

          {/* Gruppförteckning Table */}
          {expandedId === schedule.id && (
            <div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm panel-schedule-table">
                  <thead>
                    <tr className="bg-gray-50 dark:bg-gray-700/50 text-left border-b-2 border-gray-300 dark:border-gray-600">
                      <th className="px-2 py-2 w-16 font-semibold text-center">Grupp<br/>nr</th>
                      <th className="px-2 py-2 font-semibold">Gruppen omfattar</th>
                      <th className="px-2 py-2 w-16 font-semibold text-center">Modul<br/>nr</th>
                      <th className="px-2 py-2 w-20 font-semibold text-center">Märk-<br/>ström A</th>
                      <th className="px-2 py-2 w-24 font-semibold text-center">Ledar-<br/>antal/mått</th>
                      <th className="px-2 py-2 w-8 no-print"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.rows.map((row) => (
                      <tr key={row.id} className="border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50/50 dark:hover:bg-gray-700/30 group">
                        <td className="px-2 py-0.5 border-r border-gray-200 dark:border-gray-700">{renderCell(schedule, row, 'group_number')}</td>
                        <td className="px-2 py-0.5 border-r border-gray-200 dark:border-gray-700">{renderCell(schedule, row, 'description', true)}</td>
                        <td className="px-2 py-0.5 border-r border-gray-200 dark:border-gray-700">{renderCell(schedule, row, 'module_number')}</td>
                        <td className="px-2 py-0.5 border-r border-gray-200 dark:border-gray-700">{renderCell(schedule, row, 'rated_current')}</td>
                        <td className="px-2 py-0.5">{renderCell(schedule, row, 'conductor_size')}</td>
                        <td className="px-1 py-0.5 no-print">
                          <button
                            onClick={() => deleteRow(schedule.id, row.id)}
                            className="text-red-400 hover:text-red-600 text-xs opacity-0 group-hover:opacity-100 transition-opacity"
                          >
                            ✕
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Vid fel ring */}
              <div className="border-t-2 border-gray-300 dark:border-gray-600 p-3 flex items-center gap-2">
                <span className="text-sm font-semibold whitespace-nowrap">Vid fel ring:</span>
                <input
                  className="input text-sm flex-1"
                  placeholder="Telefonnummer / kontaktperson"
                  value={schedule.fault_contact || ''}
                  onChange={(e) => onUpdate(schedule.id, { fault_contact: e.target.value })}
                />
              </div>

              <div className="p-2 border-t border-gray-100 dark:border-gray-700 flex gap-2">
                <button onClick={() => addRow(schedule.id)} className="text-xs text-blue-500 hover:text-blue-600">
                  + {t('panel.addRow')}
                </button>
              </div>
            </div>
          )}
        </div>
      ))}

      {schedules.length > 0 && !showCreate && (
        <div className="flex gap-2">
          <button onClick={() => setShowCreate(true)} className="text-sm text-blue-500 hover:text-blue-600">
            {t('panel.addSchedule')}
          </button>
        </div>
      )}
    </div>
  );
}
