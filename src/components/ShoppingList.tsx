import type { ShoppingItem } from '../types';
import { useTranslation } from '../contexts/I18nContext';

interface ShoppingListProps {
  items: ShoppingItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
}

export default function ShoppingList({ items, onToggle, onDelete, onUpdateQuantity }: ShoppingListProps) {
  const { t } = useTranslation();

  // Split into parent items (no parent_item_id) and sub-items
  const parentItems = items.filter((i) => !i.parent_item_id);
  const getSubItems = (parentId: string) => items.filter((i) => i.parent_item_id === parentId);

  const uncheckedParents = parentItems.filter((i) => !i.checked);
  const checkedParents = parentItems.filter((i) => i.checked);

  if (items.length === 0) {
    return (
      <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
        <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
        </svg>
        <p>{t('shopping.empty')}</p>
        <p className="text-sm mt-1 opacity-70">{t('shopping.askAI')}</p>
      </div>
    );
  }

  const renderItem = (item: ShoppingItem, isSub = false) => (
    <div
      key={item.id}
      className={`flex items-center gap-2 transition-opacity ${item.checked ? 'opacity-40' : ''} ${isSub ? 'pl-7 py-1' : 'card'}`}
    >
      <input
        type="checkbox"
        checked={item.checked}
        onChange={(e) => onToggle(item.id, e.target.checked)}
        className={`cursor-pointer flex-shrink-0 ${isSub ? 'w-4 h-4' : 'w-5 h-5'}`}
      />
      <div className="flex-1 min-w-0">
        <span className={`${isSub ? 'text-xs' : 'text-sm font-medium'} ${item.checked ? 'line-through text-gray-400 dark:text-gray-500' : isSub ? 'text-gray-600 dark:text-gray-400' : 'text-gray-900 dark:text-gray-100'}`}>
          {item.name}
        </span>
        {!isSub && (
          <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
            {item.e_number && (
              <a
                href={`https://www.e-nummersok.se/Search?query=${encodeURIComponent(item.e_number)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded font-mono hover:bg-blue-200 dark:hover:bg-blue-800/60 transition-colors underline underline-offset-2"
              >
                E-nr: {item.e_number}
              </a>
            )}
            {item.article_number && (
              <span className="text-xs px-1.5 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded font-mono">
                {item.article_number}
              </span>
            )}
            {item.manufacturer && (
              <span className="text-xs text-gray-500 dark:text-gray-400">{item.manufacturer}</span>
            )}
          </div>
        )}
        {isSub && item.e_number && (
          <a
            href={`https://www.e-nummersok.se/Search?query=${encodeURIComponent(item.e_number)}`}
            target="_blank"
            rel="noopener noreferrer"
            onClick={(e) => e.stopPropagation()}
            className="text-xs text-blue-600 dark:text-blue-400 font-mono ml-1 hover:underline"
          >
            {item.e_number}
          </a>
        )}
      </div>
      <div className="flex items-center gap-1 flex-shrink-0">
        {!isSub && (
          <>
            <button
              onClick={() => item.quantity > 1 && onUpdateQuantity(item.id, item.quantity - 1)}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-bold"
            >-</button>
            <span className="w-8 text-center text-sm font-medium text-gray-700 dark:text-gray-300">{item.quantity}</span>
            <button
              onClick={() => onUpdateQuantity(item.id, item.quantity + 1)}
              className="w-6 h-6 flex items-center justify-center rounded bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-600 text-sm font-bold"
            >+</button>
            <span className="text-xs text-gray-500 dark:text-gray-400 w-6">{item.unit}</span>
          </>
        )}
        {isSub && (
          <span className="text-xs text-gray-500 dark:text-gray-400">{item.quantity} {item.unit}</span>
        )}
      </div>
      <button
        onClick={() => onDelete(item.id)}
        className="text-red-500 hover:text-red-700 transition-colors flex-shrink-0"
      >
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
    </div>
  );

  const renderParentWithSubs = (item: ShoppingItem) => {
    const subs = getSubItems(item.id);
    return (
      <div key={item.id}>
        {renderItem(item)}
        {subs.length > 0 && (
          <div className="border-l-2 border-gray-200 dark:border-gray-700 ml-3 mt-1 mb-2 space-y-0.5">
            {subs.map((sub) => renderItem(sub, true))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {uncheckedParents.map(renderParentWithSubs)}
      {checkedParents.length > 0 && (
        <>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide pt-2">
            {t('shopping.bought')} ({checkedParents.length})
          </div>
          {checkedParents.map(renderParentWithSubs)}
        </>
      )}
    </div>
  );
}
