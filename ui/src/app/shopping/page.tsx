'use client';

import { useState, useEffect, useContext } from 'react';
import { getCurrentShoppingList, generateShoppingList, updateShoppingItem } from '@/lib/api';
import { UserContext } from '@/lib/user-context';
import { format, startOfWeek } from 'date-fns';

export default function ShoppingPage() {
  const { currentUser } = useContext(UserContext);
  const [list, setList] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);

  useEffect(() => {
    getCurrentShoppingList().then(setList).catch(() => null).finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    const weekOf = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');
    try {
      const newList = await generateShoppingList({ week_of: weekOf, name: `Week of ${weekOf}` });
      setList(newList);
    } finally {
      setGenerating(false);
    }
  };

  const handleToggleItem = async (itemId: number, currentChecked: boolean) => {
    await updateShoppingItem(itemId, {
      checked: !currentChecked,
      checked_by: currentUser?.id,
    });
    // Update locally
    setList((prev: any) => ({
      ...prev,
      items: prev.items.map((i: any) =>
        i.id === itemId ? { ...i, checked: !currentChecked } : i
      ),
      checked_items: prev.checked_items + (currentChecked ? -1 : 1),
    }));
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  // Group items by aisle
  const aisles: Record<string, any[]> = {};
  if (list?.items) {
    for (const item of list.items) {
      const aisle = item.aisle || '📦 Other';
      if (!aisles[aisle]) aisles[aisle] = [];
      aisles[aisle].push(item);
    }
  }

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🛒 Shopping List</h1>
        <button onClick={handleGenerate} disabled={generating} className="btn-primary">
          {generating ? '⏳ Generating...' : '🔄 Generate from Plan'}
        </button>
      </div>

      {!list || list.id === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">🛒</div>
          <h3 className="text-lg font-medium mb-2">No shopping list yet</h3>
          <p className="text-gray-500 mb-4">Plan some meals first, then generate your list.</p>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary">
            Generate Shopping List
          </button>
        </div>
      ) : (
        <>
          {/* List Header */}
          <div className="card p-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="font-semibold">{list.name}</h2>
                <p className="text-sm text-gray-500">
                  {list.checked_items}/{list.total_items} items checked
                </p>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold text-brand-600">
                  {Math.round((list.checked_items / Math.max(list.total_items, 1)) * 100)}%
                </div>
                <div className="text-xs text-gray-400">complete</div>
              </div>
            </div>
            {/* Progress bar */}
            <div className="h-2 bg-gray-200 rounded-full mt-3">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${(list.checked_items / Math.max(list.total_items, 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* 🛒 Order Delivery */}
          {list.items?.length > 0 && (() => {
            const uncheckedItems = list.items.filter((i: any) => !i.checked);
            if (uncheckedItems.length === 0) return null;
            const ingredientNames = uncheckedItems.map((i: any) => i.name).join(', ');
            const instacartUrl = `https://www.instacart.com/store/search/${encodeURIComponent(ingredientNames)}`;
            const topItems = uncheckedItems.map((i: any) => i.name).slice(0, 8).join(' ');
            return (
              <div className="card p-4 bg-green-50 border-green-200">
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-green-800 text-sm">🚚 Get it delivered</h3>
                  <span className="text-xs text-green-600">{uncheckedItems.length} items remaining</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <a
                    href={instacartUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                  >
                    🥕 Instacart
                  </a>
                  <a
                    href={`https://www.kroger.com/search?query=${encodeURIComponent(topItems)}&searchType=default_search`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
                  >
                    🏪 Kroger
                  </a>
                  <a
                    href={`https://www.meijer.com/shopping/search.html?text=${encodeURIComponent(topItems)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors text-sm font-medium"
                  >
                    🛒 Meijer
                  </a>
                  <a
                    href={`https://www.walmart.com/search?q=${encodeURIComponent(topItems)}&cat_id=976759`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 text-white rounded-lg hover:bg-yellow-600 transition-colors text-sm font-medium"
                  >
                    🏬 Walmart
                  </a>
                </div>
              </div>
            );
          })()}

          {/* Items by Aisle */}
          {Object.entries(aisles).map(([aisle, items]) => (
            <div key={aisle} className="card">
              <div className="px-4 py-2 bg-gray-50 border-b border-gray-100">
                <h3 className="font-semibold text-sm text-gray-600">{aisle}</h3>
              </div>
              <div className="divide-y divide-gray-50">
                {items.map((item: any) => (
                  <label
                    key={item.id}
                    className={`flex items-center gap-3 px-4 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                      item.checked ? 'opacity-50' : ''
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={item.checked}
                      onChange={() => handleToggleItem(item.id, item.checked)}
                      className="w-5 h-5 rounded border-gray-300 text-brand-500 focus:ring-brand-500"
                    />
                    <span className={`flex-1 ${item.checked ? 'line-through text-gray-400' : ''}`}>
                      {item.name}
                    </span>
                    {item.quantity && (
                      <span className="text-sm text-gray-400">
                        {item.quantity} {item.unit}
                      </span>
                    )}
                  </label>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
