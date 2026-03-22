import { useState, useRef, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useTranslation } from '../contexts/I18nContext';
import AddressAutocomplete from './AddressAutocomplete';
import type { Job, JobContact, SavedContact } from '../types';

interface JobFormProps {
  job?: Job;
  savedContacts?: SavedContact[];
  onSubmit: (data: Omit<Job, 'id' | 'created_at' | 'updated_at'>) => void;
  onCancel: () => void;
}

const ROLES = ['client', 'builder', 'vvs', 'electrician', 'other'] as const;

function generateId() {
  return `c_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export default function JobForm({ job, savedContacts = [], onSubmit, onCancel }: JobFormProps) {
  const { t } = useTranslation();
  const [formData, setFormData] = useState({
    name: job?.name || '',
    address: job?.address || '',
    description: job?.description || '',
    lat: job?.lat as number | undefined,
    lon: job?.lon as number | undefined,
  });
  const [contacts, setContacts] = useState<JobContact[]>(
    job?.contacts || []
  );
  const [focusedContactId, setFocusedContactId] = useState<string | null>(null);
  const suggestionsRef = useRef<HTMLDivElement | null>(null);

  const roleLabels: Record<string, string> = {
    client: t('jobForm.roleClient'),
    builder: t('jobForm.roleBuilder'),
    vvs: t('jobForm.roleVvs'),
    electrician: t('jobForm.roleElectrician'),
    other: t('jobForm.roleOther'),
  };

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (suggestionsRef.current && !suggestionsRef.current.contains(e.target as Node)) {
        setFocusedContactId(null);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const addContact = () => {
    setContacts([...contacts, { id: generateId(), name: '', phone: '', email: '', role: 'client' }]);
  };

  const updateContact = (id: string, field: keyof JobContact, value: string) => {
    setContacts(contacts.map((c) => c.id === id ? { ...c, [field]: value } : c));
  };

  const removeContact = (id: string) => {
    setContacts(contacts.filter((c) => c.id !== id));
    if (focusedContactId === id) setFocusedContactId(null);
  };

  const selectSavedContact = (contactId: string, saved: SavedContact) => {
    setContacts(contacts.map((c) =>
      c.id === contactId
        ? { ...c, name: saved.name, phone: saved.phone || '', email: saved.email || '', role: saved.role }
        : c
    ));
    setFocusedContactId(null);
  };

  // Get filtered & ranked suggestions for a contact's name input
  const getSuggestions = (nameQuery: string, role: string) => {
    if (savedContacts.length === 0) return [];

    const query = nameQuery.trim().toLowerCase();
    const addressNorm = formData.address.trim().toLowerCase();

    // Filter by selected role first, then by name query
    const roleFiltered = savedContacts.filter((sc) => sc.role === role);
    const matches = query
      ? roleFiltered.filter((sc) => sc.name.toLowerCase().includes(query))
      : [...roleFiltered];

    // Rank: address-matched first, then alphabetical
    return matches.sort((a, b) => {
      const aMatch = addressNorm && a.addresses.some((addr) => addr.toLowerCase() === addressNorm);
      const bMatch = addressNorm && b.addresses.some((addr) => addr.toLowerCase() === addressNorm);
      if (aMatch && !bMatch) return -1;
      if (!aMatch && bMatch) return 1;
      return a.name.localeCompare(b.name);
    }).slice(0, 5);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) {
      alert(t('jobForm.nameRequired'));
      return;
    }
    // Filter out completely empty contacts
    const filledContacts = contacts.filter((c) => c.name.trim() || c.phone?.trim() || c.email?.trim());
    // Check if any filled contact is missing a name
    const nameless = filledContacts.filter((c) => !c.name.trim());
    if (nameless.length > 0) {
      toast.error(t('jobForm.contactNameRequired'));
      return;
    }
    onSubmit({
      ...formData,
      contacts: filledContacts.length > 0 ? filledContacts : undefined,
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
        <AddressAutocomplete
          className="input-field"
          placeholder={t('jobForm.addressPlaceholder')}
          value={formData.address}
          onChange={(address) => setFormData({ ...formData, address })}
          onCoordinates={(lat, lon) => setFormData((prev) => ({ ...prev, lat, lon }))}
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

      {/* Contacts */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="label-text mb-0">{t('jobForm.contacts')}</label>
          <button
            type="button"
            onClick={addContact}
            className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors flex items-center gap-1"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            {t('jobForm.addContact')}
          </button>
        </div>

        {contacts.length === 0 ? (
          <button
            type="button"
            onClick={addContact}
            className="w-full py-3 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:border-blue-400 dark:hover:border-blue-500 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
          >
            + {t('jobForm.addContact')}
          </button>
        ) : (
          <div className="space-y-3">
            {contacts.map((contact) => {
              const suggestions = focusedContactId === contact.id ? getSuggestions(contact.name, contact.role) : [];

              return (
                <div key={contact.id} className="p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg border border-gray-200 dark:border-gray-600">
                  <div className="flex items-center gap-2 mb-2">
                    <select
                      value={contact.role}
                      onChange={(e) => updateContact(contact.id, 'role', e.target.value)}
                      className="input-field text-sm py-1 px-2 flex-1"
                    >
                      {ROLES.map((role) => (
                        <option key={role} value={role}>{roleLabels[role]}</option>
                      ))}
                    </select>
                    <button
                      type="button"
                      onClick={() => removeContact(contact.id)}
                      className="text-red-500 hover:text-red-600 transition-colors flex-shrink-0"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                  {/* Name with autocomplete suggestions */}
                  <div className="relative" ref={focusedContactId === contact.id ? suggestionsRef : undefined}>
                    <input
                      type="text"
                      className={`input-field w-full text-sm py-1 mb-2${!contact.name.trim() && (contact.phone?.trim() || contact.email?.trim()) ? ' !border-red-400 dark:!border-red-500' : ''}`}
                      placeholder={t('jobForm.contactNamePlaceholder') + ' *'}
                      value={contact.name}
                      onChange={(e) => {
                        updateContact(contact.id, 'name', e.target.value);
                        setFocusedContactId(contact.id);
                      }}
                      onFocus={() => setFocusedContactId(contact.id)}
                    />
                    {suggestions.length > 0 && (
                      <div className="absolute z-50 left-0 right-0 top-full -mt-2 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 rounded-lg shadow-lg overflow-hidden">
                        <div className="px-2 py-1 text-xs text-gray-400 dark:text-gray-500 uppercase tracking-wide">
                          {t('jobForm.savedContacts')}
                        </div>
                        {suggestions.map((sc) => {
                          const addressMatch = formData.address.trim() && sc.addresses.some(
                            (a) => a.toLowerCase() === formData.address.trim().toLowerCase()
                          );
                          return (
                            <button
                              key={sc.id}
                              type="button"
                              className="w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors border-t border-gray-100 dark:border-gray-700 first:border-t-0"
                              onClick={() => selectSavedContact(contact.id, sc)}
                            >
                              <div className="flex items-center gap-2">
                                <span className="text-sm font-medium text-gray-900 dark:text-gray-100">{sc.name}</span>
                                <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400 rounded capitalize">
                                  {roleLabels[sc.role] || sc.role}
                                </span>
                                {addressMatch && (
                                  <svg className="w-3.5 h-3.5 text-green-500" fill="currentColor" viewBox="0 0 20 20">
                                    <path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" />
                                  </svg>
                                )}
                              </div>
                              {(sc.phone || sc.email) && (
                                <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                  {[sc.phone, sc.email].filter(Boolean).join(' · ')}
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <input
                      type="tel"
                      className="input-field text-sm py-1"
                      placeholder={t('jobForm.contactPhonePlaceholder')}
                      value={contact.phone || ''}
                      onChange={(e) => updateContact(contact.id, 'phone', e.target.value)}
                    />
                    <input
                      type="email"
                      className="input-field text-sm py-1"
                      placeholder={t('jobForm.contactEmailPlaceholder')}
                      value={contact.email || ''}
                      onChange={(e) => updateContact(contact.id, 'email', e.target.value)}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        )}
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
