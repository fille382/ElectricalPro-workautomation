import { useState, useRef, useEffect } from 'react';
import type { ShoppingItem } from '../types';
import { useTranslation } from '../contexts/I18nContext';
import { searchCatalog, type CatalogProduct } from '../utils/catalog';
import { getPBSync } from '../utils/pocketbase';

interface ShoppingListProps {
  items: ShoppingItem[];
  onToggle: (id: string, checked: boolean) => void;
  onDelete: (id: string) => void;
  onUpdateQuantity: (id: string, quantity: number) => void;
  onAddItem?: (item: Omit<ShoppingItem, 'id' | 'created_at'>) => Promise<any>;
  jobId?: string;
}

function ProductSearch({ onAdd, onClose }: { onAdd: (product: CatalogProduct, qty: number) => void; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogProduct[]>([]);
  const [searching, setSearching] = useState(false);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const searchIdRef = useRef(0); // Track search ID to ignore stale results

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSearch = (value: string) => {
    setQuery(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (value.trim().length < 2) { setResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      const thisSearchId = ++searchIdRef.current;
      setSearching(true);
      const q = value.trim();
      const words = q.split(/\s+/).filter(w => w.length >= 2);
      let r: CatalogProduct[] = [];

      // Strategy 1: Search our PocketBase product database (fulltext in description)
      const pb = getPBSync();
      if (pb) {
        try {
          // Build PB filter: each word must appear in name OR description
          const filters = words.map(w =>
            `(name ~ "${w}" || description ~ "${w}" || manufacturer ~ "${w}" || e_number ~ "${w}")`
          );
          const filter = filters.join(' && ');
          const pbResults = await pb.collection('products').getList(1, 15, { filter });
          r = pbResults.items.map((p: any) => ({
            e: p.e_number,
            n: p.name,
            d: p.description || '',
            a: p.article_number || '',
            m: p.manufacturer || '',
            c: p.category || '',
            pid: p.product_id || 0,
          }));
        } catch {
          // PB search failed, fall through to e-nummersok
        }
      }

      // Strategy 2: If PB gave few results, also search e-nummersok.se API
      if (r.length < 5) {
        const apiResults = await searchCatalog(q, 12);
        const seen = new Set(r.map(p => p.e));
        for (const p of apiResults) {
          if (!seen.has(p.e)) { r.push(p); seen.add(p.e); }
        }
      }

      // Sort by relevance
      const lowerWords = words.map(w => w.toLowerCase());
      if (words.length > 1) {
        r.sort((a, b) => {
          const aText = [a.n, a.d, a.m].join(' ').toLowerCase();
          const bText = [b.n, b.d, b.m].join(' ').toLowerCase();
          const aScore = lowerWords.filter(w => aText.includes(w)).length;
          const bScore = lowerWords.filter(w => bText.includes(w)).length;
          return bScore - aScore;
        });
      }
      // Deduplicate by E-number — prefer entries with product image (pid)
      const byE = new Map<string, CatalogProduct>();
      for (const p of r) {
        const existing = byE.get(p.e);
        if (!existing || (p.pid && !existing.pid)) {
          byE.set(p.e, p);
        }
      }
      r = Array.from(byE.values());
      // Only update if this is still the latest search
      if (thisSearchId === searchIdRef.current) {
        setResults(r.slice(0, 15));
        setSearching(false);
      }
    }, 300);
  };

  const getQty = (eNr: string) => quantities[eNr] || 1;
  const setQty = (eNr: string, qty: number) => setQuantities(prev => ({ ...prev, [eNr]: Math.max(1, qty) }));

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-50 flex items-start justify-center p-4 pt-16" onClick={onClose}>
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
        {/* Search header */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <input
                ref={inputRef}
                value={query}
                onChange={e => handleSearch(e.target.value)}
                placeholder="Sök produkt, E-nummer, artikel..."
                className="w-full pl-9 pr-3 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              {searching && <div className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />}
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto p-2">
          {results.length === 0 && query.length >= 2 && !searching && (
            <p className="text-center text-gray-400 py-8 text-sm">Inga produkter hittades</p>
          )}
          {results.length === 0 && query.length < 2 && (
            <p className="text-center text-gray-400 py-8 text-sm">Skriv minst 2 tecken för att söka</p>
          )}
          {results.map(product => {
            const imgUrl = product.pid ? `https://www.e-nummersok.se/thumb/id/${product.pid}/BILD1/100/100` : null;
            return (
              <div key={product.e} className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors border border-transparent hover:border-gray-200 dark:hover:border-gray-600">
                {imgUrl && (
                  <div className="w-12 h-12 flex-shrink-0 rounded bg-white dark:bg-gray-700 overflow-hidden border border-gray-200 dark:border-gray-600">
                    <img src={imgUrl} alt="" className="w-full h-full object-contain" loading="lazy" onError={(e) => { (e.target as HTMLImageElement).parentElement!.style.display = 'none'; }} />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100 truncate">{product.n}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                    <span className="text-xs px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 rounded font-mono">
                      {product.e}
                    </span>
                    {product.a && (
                      <span className="text-xs text-gray-500 dark:text-gray-400 font-mono">{product.a}</span>
                    )}
                    <span className="text-xs text-gray-400 dark:text-gray-500">{product.m}</span>
                  </div>
                  {product.d && <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5 line-clamp-1">{product.d}</p>}
                </div>
                <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setQty(product.e, getQty(product.e) - 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-600 text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-500"
                    >-</button>
                    <span className="w-8 text-center text-sm font-semibold">{getQty(product.e)}</span>
                    <button
                      onClick={() => setQty(product.e, getQty(product.e) + 1)}
                      className="w-7 h-7 flex items-center justify-center rounded-lg bg-gray-200 dark:bg-gray-600 text-sm font-bold hover:bg-gray-300 dark:hover:bg-gray-500"
                    >+</button>
                  </div>
                  <button
                    onClick={() => onAdd(product, getQty(product.e))}
                    className="px-3 py-1.5 bg-blue-600 text-white text-xs font-semibold rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Lägg till
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function ShoppingList({ items, onToggle, onDelete, onUpdateQuantity, onAddItem, jobId }: ShoppingListProps) {
  const { t } = useTranslation();
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [showSearch, setShowSearch] = useState(false);

  const handleAddProduct = async (product: CatalogProduct, qty: number) => {
    if (!onAddItem || !jobId) return;
    await onAddItem({
      job_id: jobId,
      name: product.n,
      e_number: product.e,
      article_number: product.a,
      manufacturer: product.m,
      category: product.c || 'Övrigt',
      quantity: qty,
      unit: 'st',
      checked: false,
    });
  };

  // Split into parent items and sub-items
  const parentItems = items.filter((i) => !i.parent_item_id);
  const getSubItems = (parentId: string) => items.filter((i) => i.parent_item_id === parentId);

  if (items.length === 0) {
    return (
      <>
        {showSearch && <ProductSearch onAdd={handleAddProduct} onClose={() => setShowSearch(false)} />}
        <div className="card text-center py-8 text-gray-500 dark:text-gray-400">
          <svg className="w-12 h-12 mx-auto mb-3 opacity-50" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 100 4 2 2 0 000-4z" />
          </svg>
          <p>{t('shopping.empty')}</p>
          <button
            onClick={() => setShowSearch(true)}
            className="mt-3 btn-primary text-sm flex items-center gap-1.5 mx-auto"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
            </svg>
            Sök produkt
          </button>
          <p className="text-sm mt-2 opacity-70">{t('shopping.askAI')}</p>
        </div>
      </>
    );
  }

  const toggleCategory = (cat: string) => {
    setCollapsedCategories(prev => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  };

  // Group parent items by category
  const uncheckedParents = parentItems.filter((i) => !i.checked);
  const checkedParents = parentItems.filter((i) => i.checked);

  const groupByCategory = (items: ShoppingItem[]) => {
    const groups = new Map<string, ShoppingItem[]>();
    for (const item of items) {
      const cat = item.category || 'Övrigt';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(item);
    }
    return groups;
  };

  const uncheckedGroups = groupByCategory(uncheckedParents);
  const hasCategories = uncheckedGroups.size > 1 || (uncheckedGroups.size === 1 && !uncheckedGroups.has('Övrigt'));

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

  const renderCategoryGroup = (category: string, categoryItems: ShoppingItem[]) => {
    const isCollapsed = collapsedCategories.has(category);
    const checkedCount = categoryItems.filter(i => i.checked).length;

    return (
      <div key={category}>
        <button
          onClick={() => toggleCategory(category)}
          className="w-full flex items-center gap-2 py-2 px-1 text-left group"
        >
          <svg
            className={`w-4 h-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-90'}`}
            fill="currentColor" viewBox="0 0 20 20"
          >
            <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          <span className="text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 group-hover:text-gray-700 dark:group-hover:text-gray-300 transition-colors">
            {category}
          </span>
          <span className="text-xs text-gray-400 dark:text-gray-500">
            {checkedCount > 0 ? `${checkedCount}/${categoryItems.length}` : categoryItems.length}
          </span>
        </button>
        {!isCollapsed && (
          <div className="space-y-1.5 ml-1">
            {categoryItems.map(renderParentWithSubs)}
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="space-y-2">
      {showSearch && <ProductSearch onAdd={handleAddProduct} onClose={() => setShowSearch(false)} />}
      <button
        onClick={() => setShowSearch(true)}
        className="w-full py-2 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg text-gray-500 dark:text-gray-400 hover:border-blue-400 hover:text-blue-500 dark:hover:border-blue-500 dark:hover:text-blue-400 transition-colors flex items-center justify-center gap-2 text-sm"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
        Sök & lägg till produkt
      </button>
      {hasCategories ? (
        // Grouped by category
        Array.from(uncheckedGroups.entries()).map(([cat, catItems]) =>
          renderCategoryGroup(cat, catItems)
        )
      ) : (
        // Flat list (no categories or single "Övrigt")
        uncheckedParents.map(renderParentWithSubs)
      )}
      {checkedParents.length > 0 && (
        <>
          <div className="text-xs text-gray-500 dark:text-gray-400 font-medium uppercase tracking-wide pt-2 border-t border-gray-200 dark:border-gray-700 mt-3">
            {t('shopping.bought')} ({checkedParents.length})
          </div>
          <div className="space-y-1.5 opacity-50">
            {checkedParents.map(renderParentWithSubs)}
          </div>
        </>
      )}
    </div>
  );
}
