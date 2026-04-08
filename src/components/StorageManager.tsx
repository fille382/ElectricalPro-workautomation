import { useState } from 'react';
import type { StorageLocation, StorageItem, ShoppingItem } from '../types';

interface StorageManagerProps {
  locations: StorageLocation[];
  items: StorageItem[];
  onAddLocation: (name: string) => Promise<any>;
  onDeleteLocation: (id: string) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<StorageItem>) => Promise<void>;
  onDeleteItem: (id: string) => Promise<void>;
  onUseOnJob?: (item: StorageItem) => void;
  mode?: 'full' | 'picker';
  onPickLocation?: (locationId: string) => void;
  onClose?: () => void;
}

function generateId(): string {
  return `sloc_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

function formatPrice(price: number): string {
  return price.toLocaleString('sv-SE');
}

export default function StorageManager({
  locations,
  items,
  onAddLocation,
  onDeleteLocation,
  onUpdateItem,
  onDeleteItem,
  onUseOnJob,
  mode = 'full',
  onPickLocation,
  onClose,
}: StorageManagerProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [creatingNew, setCreatingNew] = useState(false);
  const [newName, setNewName] = useState('');

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleCreateLocation = async () => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    await onAddLocation(trimmed);
    setNewName('');
    setCreatingNew(false);
  };

  const getItemsForLocation = (locationId: string): StorageItem[] => {
    return items.filter((item) => item.location_id === locationId);
  };

  const handleQuantityChange = async (item: StorageItem, delta: number) => {
    const newQty = Math.max(0, item.quantity + delta);
    if (newQty === 0) {
      await onDeleteItem(item.id);
    } else {
      await onUpdateItem(item.id, { quantity: newQty });
    }
  };

  // --- Picker mode (modal) ---
  if (mode === 'picker') {
    return (
      <div
        className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-center justify-center p-4"
        onClick={(e) => {
          if (e.target === e.currentTarget) onClose?.();
        }}
      >
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-lg w-full max-w-sm p-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Välj lagerplats
          </h2>

          <div className="space-y-2">
            {locations.map((loc) => (
              <button
                key={loc.id}
                onClick={() => {
                  onPickLocation?.(loc.id);
                  onClose?.();
                }}
                className="w-full text-left px-4 py-3 rounded-lg bg-gray-50 dark:bg-gray-700 hover:bg-blue-50 dark:hover:bg-blue-900/30 text-gray-900 dark:text-gray-100 transition-colors"
              >
                <span className="font-medium">{loc.name}</span>
                <span className="ml-2 text-sm text-gray-500 dark:text-gray-400">
                  ({getItemsForLocation(loc.id).length} artiklar)
                </span>
              </button>
            ))}
          </div>

          {creatingNew ? (
            <div className="mt-3 flex gap-2">
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleCreateLocation();
                  if (e.key === 'Escape') {
                    setCreatingNew(false);
                    setNewName('');
                  }
                }}
                placeholder="Platsnamn..."
                autoFocus
                className="flex-1 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={handleCreateLocation}
                className="px-3 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
              >
                Skapa
              </button>
            </div>
          ) : (
            <button
              onClick={() => setCreatingNew(true)}
              className="mt-3 w-full px-4 py-3 rounded-lg border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors text-sm"
            >
              + Ny plats
            </button>
          )}

          <button
            onClick={() => onClose?.()}
            className="mt-3 w-full px-4 py-2 rounded-lg text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors"
          >
            Avbryt
          </button>
        </div>
      </div>
    );
  }

  // --- Full mode ---
  return (
    <div className="space-y-4">
      {locations.length === 0 && !creatingNew && (
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          Inga lagerplatser. Skapa en plats som &quot;Bilen&quot; eller &quot;Kontoret&quot;.
        </div>
      )}

      {locations.map((loc) => {
        const locItems = getItemsForLocation(loc.id);
        const isExpanded = expandedIds.has(loc.id);

        return (
          <div
            key={loc.id}
            className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden"
          >
            {/* Location header */}
            <button
              onClick={() => toggleExpanded(loc.id)}
              className="w-full flex items-center justify-between px-4 py-3 text-left"
            >
              <div className="flex items-center gap-2">
                <svg
                  className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                </svg>
                <span className="font-medium text-gray-900 dark:text-gray-100">
                  {loc.name}
                </span>
                <span className="text-sm text-gray-500 dark:text-gray-400">
                  ({locItems.length})
                </span>
              </div>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onDeleteLocation(loc.id);
                }}
                className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                title="Ta bort plats"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </button>

            {/* Expanded items */}
            {isExpanded && (
              <div className="border-t border-gray-200 dark:border-gray-700">
                {locItems.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">
                    Inga artiklar på denna plats.
                  </div>
                ) : (
                  <div className="divide-y divide-gray-100 dark:divide-gray-700">
                    {locItems.map((item) => (
                      <div key={item.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 dark:text-gray-100 truncate">
                              {item.name}
                            </div>
                            <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                              {item.e_number && <span>E-nr: {item.e_number}</span>}
                              {item.price != null && (
                                <span>{formatPrice(item.price)} kr</span>
                              )}
                            </div>
                          </div>

                          {/* Quantity adjuster */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              onClick={() => handleQuantityChange(item, -1)}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
                            >
                              -
                            </button>
                            <span className="text-sm font-medium text-gray-900 dark:text-gray-100 w-12 text-center">
                              {item.quantity} {item.unit}
                            </span>
                            <button
                              onClick={() => handleQuantityChange(item, 1)}
                              className="w-7 h-7 flex items-center justify-center rounded-full bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 text-sm font-medium transition-colors"
                            >
                              +
                            </button>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex gap-2 mt-2">
                          {onUseOnJob && (
                            <button
                              onClick={() => onUseOnJob(item)}
                              className="text-xs px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-blue-900/50 font-medium transition-colors"
                            >
                              Använd på jobb
                            </button>
                          )}
                          <button
                            onClick={() => onDeleteItem(item.id)}
                            className="text-xs px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/50 font-medium transition-colors"
                          >
                            Ta bort
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        );
      })}

      {/* Create new location */}
      {creatingNew ? (
        <div className="flex gap-2">
          <input
            type="text"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateLocation();
              if (e.key === 'Escape') {
                setCreatingNew(false);
                setNewName('');
              }
            }}
            placeholder="Platsnamn..."
            autoFocus
            className="flex-1 px-4 py-2.5 rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={handleCreateLocation}
            className="px-4 py-2.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 transition-colors"
          >
            Skapa
          </button>
          <button
            onClick={() => {
              setCreatingNew(false);
              setNewName('');
            }}
            className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Avbryt
          </button>
        </div>
      ) : (
        <button
          onClick={() => setCreatingNew(true)}
          className="w-full px-4 py-3 rounded-xl border-2 border-dashed border-gray-300 dark:border-gray-600 text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 transition-colors font-medium"
        >
          + Ny plats
        </button>
      )}
    </div>
  );
}
