'use client';

import { useState, useEffect, useContext } from 'react';
import { getCurrentShoppingList, generateShoppingList, updateShoppingItem } from '@/lib/api';
import { UserContext } from '@/lib/user-context';
import { format, startOfWeek } from 'date-fns';

const AMAZON_TAG = 'trevordukeco-20';

// Strip leading quantities/units, parentheticals, and trailing prep so cart
// search URLs find the actual product (Kroger's search hates "(optional)" and
// "1 (8-ounce) box").
function searchTerm(name: string): string {
  if (!name) return '';
  let s = name;
  // Remove parentheticals: "(8-ounce)", "(optional)", "(such as ...)"
  s = s.replace(/\([^)]*\)/g, ' ');
  // Drop leading numbers + fractions + units: "1 ½ cups", "2 (10-oz) cans", "¾ cup"
  s = s.replace(/^[\s\d¼½¾⅓⅔⅛⅜⅝⅞.,/-]+/, '');
  s = s.replace(
    /^(?:cup|cups|c|tsp|tsps|teaspoon|teaspoons|tbsp|tbsps|tablespoon|tablespoons|oz|ounce|ounces|lb|lbs|pound|pounds|g|grams|kg|ml|liter|liters|l|pinch|dash|clove|cloves|can|cans|jar|jars|pkg|package|packages|box|boxes|bottle|bottles|bunch|bunches|sprig|sprigs|stick|sticks|slice|slices|head|heads|bag|bags|container|containers)\b\.?\s*(?:of\s+)?/i,
    '',
  );
  // Drop trailing prep modifiers
  s = s.replace(/,\s*(softened|melted|drained|rinsed|chopped|diced|minced|sliced|cubed|grated|shredded|crushed|peeled|seeded|cored|stemmed|divided|packed|optional|to taste).*$/i, '');
  s = s.replace(/\b(for serving|for garnish|to taste)\b.*$/i, '');
  return s.replace(/\s+/g, ' ').trim();
}

function krogerSearchUrl(name: string) {
  const q = searchTerm(name) || name;
  return `https://www.kroger.com/search?query=${encodeURIComponent(q)}&searchType=default_search`;
}

function wholeFoodsSearchUrl(name: string) {
  const q = searchTerm(name) || name;
  return `https://www.amazon.com/s?k=${encodeURIComponent(q)}&i=wholefoods&tag=${AMAZON_TAG}`;
}

export default function ShoppingPage() {
  const { currentUser } = useContext(UserContext);
  const [list, setList] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [store, setStore] = useState<'kroger' | 'wholefoods'>('kroger');

  const currentWeekOf = format(startOfWeek(new Date(), { weekStartsOn: 1 }), 'yyyy-MM-dd');

  useEffect(() => {
    getCurrentShoppingList().then(setList).catch(() => null).finally(() => setLoading(false));
  }, []);

  const handleGenerate = async () => {
    setGenerating(true);
    try {
      const newList = await generateShoppingList({
        week_of: currentWeekOf,
        name: `Week of ${currentWeekOf}`,
      });
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
    setList((prev: any) => ({
      ...prev,
      items: prev.items.map((i: any) =>
        i.id === itemId ? { ...i, checked: !currentChecked } : i
      ),
      checked_items: prev.checked_items + (currentChecked ? -1 : 1),
    }));
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;

  // Detect a stale list (older than current week) so the user knows to refresh
  const isStale =
    !!list &&
    list.id !== 0 &&
    list.week_of &&
    String(list.week_of).slice(0, 10) !== currentWeekOf;

  // Group items by aisle for the checkbox view
  const aisles: Record<string, any[]> = {};
  if (list?.items) {
    for (const item of list.items) {
      const aisle = item.aisle || '📦 Other';
      if (!aisles[aisle]) aisles[aisle] = [];
      aisles[aisle].push(item);
    }
  }

  const uncheckedItems = list?.items?.filter((i: any) => !i.checked) || [];

  const storeMeta =
    store === 'kroger'
      ? { label: 'Kroger', emoji: '🛒', accent: 'blue', urlFor: krogerSearchUrl, cartUrl: 'https://www.kroger.com/cart' }
      : { label: 'Whole Foods', emoji: '🥑', accent: 'green', urlFor: wholeFoodsSearchUrl, cartUrl: `https://www.amazon.com/alm/storefront?almBrandId=VUZHIFdob2xlIEZvb2Rz&tag=${AMAZON_TAG}` };

  const accentBg = storeMeta.accent === 'blue' ? 'bg-blue-50 border-blue-200' : 'bg-green-50 border-green-200';
  const accentText = storeMeta.accent === 'blue' ? 'text-blue-800' : 'text-green-800';
  const accentSub = storeMeta.accent === 'blue' ? 'text-blue-600' : 'text-green-600';
  const accentRow = storeMeta.accent === 'blue' ? 'border-blue-200 hover:bg-blue-100' : 'border-green-200 hover:bg-green-100';

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
          {isStale && (
            <div className="card p-3 bg-amber-50 border-amber-200 flex items-center justify-between gap-3">
              <div className="text-sm text-amber-800">
                ⚠️ This list is from <b>{String(list.week_of).slice(0, 10)}</b>. Current week is{' '}
                <b>{currentWeekOf}</b>.
              </div>
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="px-3 py-1.5 bg-amber-600 text-white rounded-lg text-sm font-medium hover:bg-amber-700 disabled:opacity-50"
              >
                {generating ? '…' : 'Refresh for this week'}
              </button>
            </div>
          )}

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
            <div className="h-2 bg-gray-200 rounded-full mt-3">
              <div
                className="h-full bg-green-500 rounded-full transition-all duration-300"
                style={{ width: `${(list.checked_items / Math.max(list.total_items, 1)) * 100}%` }}
              />
            </div>
          </div>

          {/* Store toggle */}
          {uncheckedItems.length > 0 && (
            <div className="flex gap-2">
              <button
                onClick={() => setStore('kroger')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  store === 'kroger'
                    ? 'bg-blue-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🛒 Kroger
              </button>
              <button
                onClick={() => setStore('wholefoods')}
                className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  store === 'wholefoods'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                🥑 Whole Foods
              </button>
            </div>
          )}

          {/* Shop online */}
          {uncheckedItems.length > 0 && (
            <div className={`card p-4 ${accentBg}`}>
              <div className="flex items-center justify-between mb-2">
                <h3 className={`font-semibold ${accentText} text-sm`}>
                  {storeMeta.emoji} Shop at {storeMeta.label}
                </h3>
                <a
                  href={storeMeta.cartUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-xs ${accentSub} underline`}
                >
                  Open cart →
                </a>
              </div>
              <p className={`text-xs ${accentSub} mb-2`}>
                Each link searches the cleaned ingredient name only — no quantities, no “(optional)”.
              </p>
              <div className="space-y-1">
                {uncheckedItems.map((item: any) => (
                  <a
                    key={item.id}
                    href={storeMeta.urlFor(item.name)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-2 px-3 py-1.5 bg-white rounded-lg border ${accentRow} transition-colors text-sm`}
                  >
                    <span className={accentSub}>🔍</span>
                    <span className="text-gray-700">{searchTerm(item.name) || item.name}</span>
                    {item.quantity ? (
                      <span className="text-gray-400 text-xs ml-auto">
                        {item.quantity} {item.unit}
                      </span>
                    ) : null}
                  </a>
                ))}
              </div>
            </div>
          )}

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
                    {item.quantity ? (
                      <span className="text-sm text-gray-400">
                        {item.quantity} {item.unit}
                      </span>
                    ) : null}
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
