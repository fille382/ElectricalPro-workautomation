import { useState, useEffect, useMemo } from 'react';
// import { useTranslation } from '../contexts/I18nContext';
import type { ShoppingItem, Invoice, InvoiceCustomItem, Receipt } from '../types';
import { getSettings } from '../utils/db';

interface InvoiceTabProps {
  jobId: string;
  shoppingItems: ShoppingItem[];
  receipts: Receipt[];
  invoice: Invoice | null;
  onUpdateInvoice: (updates: Partial<Invoice>) => Promise<any>;
  jobName: string;
  jobAddress: string;
}

function formatSEK(amount: number): string {
  return amount.toLocaleString('sv-SE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function generateCustomItemId(): string {
  return `ci_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
}

interface ReceiptGroup {
  receiptId: string | undefined;
  storeName: string;
  receiptDate: string;
  items: ShoppingItem[];
  subtotal: number;
}

export default function InvoiceTab({
  shoppingItems,
  receipts,
  invoice,
  onUpdateInvoice,
  jobName,
  jobAddress,
}: InvoiceTabProps) {

  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    getSettings().then((s) => {
      if (s.company_name) setCompanyName(s.company_name);
    });
  }, []);

  // Material items: checked and has a price
  const materialItems = useMemo(
    () => shoppingItems.filter((item) => item.checked && item.price != null && item.price > 0),
    [shoppingItems],
  );

  // Group material items by receipt
  const receiptGroups = useMemo<ReceiptGroup[]>(() => {
    const groups = new Map<string, ReceiptGroup>();

    for (const item of materialItems) {
      const key = item.receipt_id || '__no_receipt__';
      if (!groups.has(key)) {
        const receipt = item.receipt_id
          ? receipts.find((r) => r.id === item.receipt_id)
          : undefined;
        groups.set(key, {
          receiptId: item.receipt_id,
          storeName: receipt?.store_name || 'Okänt kvitto',
          receiptDate: receipt?.receipt_date || '',
          items: [],
          subtotal: 0,
        });
      }
      const group = groups.get(key)!;
      group.items.push(item);
      group.subtotal += (item.price || 0) * item.quantity;
    }

    return Array.from(groups.values());
  }, [materialItems, receipts]);

  const customItems = invoice?.custom_line_items || [];
  const markupPercentage = invoice?.markup_percentage ?? 30;

  // Totals
  const materialTotal = receiptGroups.reduce((sum, g) => sum + g.subtotal, 0);
  const customTotal = customItems.reduce((sum, item) => sum + item.amount, 0);
  const subtotal = materialTotal + customTotal;
  const markupAmount = subtotal * (markupPercentage / 100);
  const totalExclVat = subtotal + markupAmount;
  const vatAmount = totalExclVat * 0.25;
  const totalInclVat = totalExclVat + vatAmount;

  // Custom line item management
  const handleAddCustomItem = () => {
    const newItem: InvoiceCustomItem = {
      id: generateCustomItemId(),
      description: '',
      amount: 0,
    };
    onUpdateInvoice({
      custom_line_items: [...customItems, newItem],
    });
  };

  const handleUpdateCustomItem = (id: string, field: 'description' | 'amount', value: string | number) => {
    const updated = customItems.map((item) =>
      item.id === id ? { ...item, [field]: value } : item,
    );
    onUpdateInvoice({ custom_line_items: updated });
  };

  const handleDeleteCustomItem = (id: string) => {
    onUpdateInvoice({
      custom_line_items: customItems.filter((item) => item.id !== id),
    });
  };

  const handleMarkupChange = (value: number) => {
    onUpdateInvoice({ markup_percentage: value });
  };

  // Share / copy
  const handleShare = async () => {
    const lines: string[] = [];
    lines.push('FAKTURA');
    if (companyName) lines.push(companyName);
    lines.push(`Jobb: ${jobName}`);
    if (jobAddress) lines.push(`Adress: ${jobAddress}`);
    lines.push('');

    if (materialItems.length > 0) {
      lines.push('MATERIAL:');
      for (const item of materialItems) {
        const lineTotal = (item.price || 0) * item.quantity;
        lines.push(`- ${item.name} x${item.quantity} = ${formatSEK(lineTotal)} kr`);
      }
      lines.push(`Materialkostnad: ${formatSEK(materialTotal)} kr`);
      lines.push('');
    }

    if (customItems.length > 0) {
      lines.push('ÖVRIGA KOSTNADER:');
      for (const item of customItems) {
        lines.push(`- ${item.description}: ${formatSEK(item.amount)} kr`);
      }
      lines.push('');
    }

    lines.push(`Delsumma: ${formatSEK(subtotal)} kr`);
    lines.push(`Påslag (${markupPercentage}%): ${formatSEK(markupAmount)} kr`);
    lines.push(`Totalt exkl. moms: ${formatSEK(totalExclVat)} kr`);
    lines.push(`Moms (25%): ${formatSEK(vatAmount)} kr`);
    lines.push(`TOTALT: ${formatSEK(totalInclVat)} kr`);

    const text = lines.join('\n');

    if (navigator.share) {
      try {
        await navigator.share({ title: `Faktura – ${jobName}`, text });
        return;
      } catch {
        // User cancelled or share failed, fall through to clipboard
      }
    }

    try {
      await navigator.clipboard.writeText(text);
      alert('Kopierat till urklipp!');
    } catch {
      // Fallback: prompt
      prompt('Kopiera texten nedan:', text);
    }
  };

  // Empty state
  if (materialItems.length === 0 && customItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-center">
        <svg
          className="w-16 h-16 text-gray-300 dark:text-gray-600 mb-4"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z"
          />
        </svg>
        <p className="text-gray-500 dark:text-gray-400 text-lg font-medium mb-1">
          Inga kvitton inskannade ännu
        </p>
        <p className="text-gray-400 dark:text-gray-500 text-sm">
          Skanna ett kvitto i Inköpslistan.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Material costs */}
      {receiptGroups.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
            Materialkostnad
          </h3>

          {receiptGroups.map((group) => (
            <div key={group.receiptId || '__no_receipt__'} className="mb-4 last:mb-0">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  {group.storeName}
                </span>
                {group.receiptDate && (
                  <span className="text-xs text-gray-500 dark:text-gray-400">
                    {group.receiptDate}
                  </span>
                )}
              </div>

              <div className="space-y-1">
                {group.items.map((item) => {
                  const lineTotal = (item.price || 0) * item.quantity;
                  return (
                    <div
                      key={item.id}
                      className="flex items-center justify-between text-sm py-1"
                    >
                      <span className="text-gray-700 dark:text-gray-300 flex-1 min-w-0 truncate">
                        {item.name}
                      </span>
                      <div className="flex items-center gap-3 ml-2 shrink-0">
                        <span className="text-gray-500 dark:text-gray-400 tabular-nums">
                          {item.quantity} × {formatSEK(item.price || 0)}
                        </span>
                        <span className="text-gray-900 dark:text-gray-100 font-medium tabular-nums w-24 text-right">
                          {formatSEK(lineTotal)} kr
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-between mt-2 pt-2 border-t border-gray-100 dark:border-gray-700 text-sm">
                <span className="text-gray-500 dark:text-gray-400">Delsumma</span>
                <span className="font-medium text-gray-900 dark:text-gray-100 tabular-nums">
                  {formatSEK(group.subtotal)} kr
                </span>
              </div>
            </div>
          ))}

          <div className="flex justify-between mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 font-semibold">
            <span className="text-gray-900 dark:text-gray-100">Materialkostnad totalt</span>
            <span className="text-gray-900 dark:text-gray-100 tabular-nums">
              {formatSEK(materialTotal)} kr
            </span>
          </div>
        </div>
      )}

      {/* Custom line items */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Övriga kostnader
        </h3>

        {customItems.length > 0 && (
          <div className="space-y-2 mb-3">
            {customItems.map((item) => (
              <div key={item.id} className="flex items-center gap-2">
                <input
                  type="text"
                  className="input flex-1 min-w-0"
                  placeholder="Beskrivning (t.ex. Arbete, Resa)"
                  value={item.description}
                  onChange={(e) =>
                    handleUpdateCustomItem(item.id, 'description', e.target.value)
                  }
                />
                <div className="relative shrink-0">
                  <input
                    type="number"
                    className="input w-28 text-right pr-8"
                    placeholder="0"
                    value={item.amount || ''}
                    onChange={(e) =>
                      handleUpdateCustomItem(
                        item.id,
                        'amount',
                        parseFloat(e.target.value) || 0,
                      )
                    }
                  />
                  <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
                    kr
                  </span>
                </div>
                <button
                  onClick={() => handleDeleteCustomItem(item.id)}
                  className="p-2 text-red-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors shrink-0"
                  title="Ta bort"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}

        <button onClick={handleAddCustomItem} className="btn-secondary text-sm w-full">
          + Lägg till rad
        </button>
      </div>

      {/* Markup control */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Påslag
          </label>
          <div className="relative">
            <input
              type="number"
              className="input w-24 text-right pr-7"
              value={markupPercentage}
              min={0}
              max={100}
              onChange={(e) => handleMarkupChange(parseFloat(e.target.value) || 0)}
            />
            <span className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 text-sm pointer-events-none">
              %
            </span>
          </div>
        </div>
      </div>

      {/* Summary */}
      <div className="bg-white dark:bg-gray-800 rounded-xl p-4 border border-gray-200 dark:border-gray-700">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-3">
          Sammanfattning
        </h3>

        <div className="space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Materialkostnad</span>
            <span className="text-gray-900 dark:text-gray-100 tabular-nums">
              {formatSEK(materialTotal)} kr
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Övriga kostnader</span>
            <span className="text-gray-900 dark:text-gray-100 tabular-nums">
              {formatSEK(customTotal)} kr
            </span>
          </div>

          <div className="flex justify-between pt-2 border-t border-gray-100 dark:border-gray-700">
            <span className="text-gray-700 dark:text-gray-300 font-medium">Delsumma</span>
            <span className="text-gray-900 dark:text-gray-100 font-medium tabular-nums">
              {formatSEK(subtotal)} kr
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">
              Påslag {markupPercentage}%
            </span>
            <span className="text-gray-900 dark:text-gray-100 tabular-nums">
              {formatSEK(markupAmount)} kr
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-700 dark:text-gray-300 font-medium">
              Totalt exkl. moms
            </span>
            <span className="text-gray-900 dark:text-gray-100 font-medium tabular-nums">
              {formatSEK(totalExclVat)} kr
            </span>
          </div>

          <div className="flex justify-between">
            <span className="text-gray-500 dark:text-gray-400">Moms 25%</span>
            <span className="text-gray-900 dark:text-gray-100 tabular-nums">
              {formatSEK(vatAmount)} kr
            </span>
          </div>

          <div className="flex justify-between pt-3 border-t-2 border-gray-200 dark:border-gray-600">
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100">
              Totalt inkl. moms
            </span>
            <span className="text-lg font-bold text-gray-900 dark:text-gray-100 tabular-nums">
              {formatSEK(totalInclVat)} kr
            </span>
          </div>
        </div>
      </div>

      {/* Share button */}
      <button onClick={handleShare} className="btn-primary w-full flex items-center justify-center gap-2">
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        Dela faktura
      </button>
    </div>
  );
}
