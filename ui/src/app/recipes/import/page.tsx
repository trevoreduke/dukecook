'use client';

import { useState, useContext } from 'react';
import { useRouter } from 'next/navigation';
import { importRecipe, bulkImport } from '@/lib/api';
import { UserContext } from '@/app/layout';

export default function ImportPage() {
  const router = useRouter();
  const { currentUser } = useContext(UserContext);
  const [url, setUrl] = useState('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [results, setResults] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const handleSingleImport = async () => {
    if (!url.trim()) return;
    setLoading(true);
    setResults([]);
    try {
      const result = await importRecipe(url.trim(), currentUser?.id);
      setResults([result]);
      if (result.status === 'success') {
        setUrl('');
      }
    } catch (e: any) {
      setResults([{ status: 'failed', url: url, error: e.message }]);
    }
    setLoading(false);
  };

  const handleBulkImport = async () => {
    const urls = bulkUrls.split('\n').map(u => u.trim()).filter(Boolean);
    if (!urls.length) return;
    setLoading(true);
    setResults([]);
    try {
      const results = await bulkImport(urls, currentUser?.id);
      setResults(results);
    } catch (e: any) {
      setResults([{ status: 'failed', error: e.message }]);
    }
    setLoading(false);
  };

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">📥 Import Recipes</h1>

      {/* Mode Toggle */}
      <div className="flex gap-2">
        <button
          className={`px-4 py-2 rounded-lg font-medium ${mode === 'single' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}
          onClick={() => setMode('single')}
        >
          Single URL
        </button>
        <button
          className={`px-4 py-2 rounded-lg font-medium ${mode === 'bulk' ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'}`}
          onClick={() => setMode('bulk')}
        >
          Bulk Import
        </button>
      </div>

      {/* Single Import */}
      {mode === 'single' && (
        <div className="card p-5">
          <p className="text-gray-600 mb-4">
            Paste a recipe URL and we&apos;ll extract everything automatically — title, ingredients, steps, times, and photo.
          </p>
          <div className="flex gap-2">
            <input
              className="input flex-1"
              placeholder="https://www.seriouseats.com/best-chicken-recipe..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSingleImport()}
              disabled={loading}
            />
            <button onClick={handleSingleImport} disabled={loading || !url.trim()} className="btn-primary whitespace-nowrap">
              {loading ? '⏳ Importing...' : '📥 Import'}
            </button>
          </div>
          <p className="text-xs text-gray-400 mt-2">
            Works with NYT Cooking, Bon Appétit, Serious Eats, AllRecipes, food blogs, and more.
          </p>
        </div>
      )}

      {/* Bulk Import */}
      {mode === 'bulk' && (
        <div className="card p-5">
          <p className="text-gray-600 mb-4">
            Paste multiple URLs (one per line) to import them all at once.
          </p>
          <textarea
            className="input mb-3"
            placeholder={"https://recipe1.com/...\nhttps://recipe2.com/...\nhttps://recipe3.com/..."}
            value={bulkUrls}
            onChange={(e) => setBulkUrls(e.target.value)}
            rows={6}
            disabled={loading}
          />
          <button
            onClick={handleBulkImport}
            disabled={loading || !bulkUrls.trim()}
            className="btn-primary w-full"
          >
            {loading ? '⏳ Importing...' : `📥 Import ${bulkUrls.split('\n').filter(u => u.trim()).length} URLs`}
          </button>
        </div>
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Import Results</h3>
          <div className="space-y-2">
            {results.map((r, i) => (
              <div
                key={i}
                className={`p-3 rounded-lg ${r.status === 'success' ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'}`}
              >
                <div className="flex items-center gap-2">
                  <span>{r.status === 'success' ? '✅' : '❌'}</span>
                  <span className="font-medium">
                    {r.status === 'success' ? r.recipe_title : 'Import Failed'}
                  </span>
                  {r.extraction_method && (
                    <span className="badge bg-white text-gray-500">{r.extraction_method}</span>
                  )}
                  {r.duration_ms && (
                    <span className="text-xs text-gray-400">{(r.duration_ms / 1000).toFixed(1)}s</span>
                  )}
                </div>
                {r.error && <p className="text-sm text-red-600 mt-1">{r.error}</p>}
                {r.status === 'success' && (
                  <button
                    onClick={() => router.push(`/recipes/${r.recipe_id}`)}
                    className="text-sm text-brand-500 hover:underline mt-1"
                  >
                    View Recipe →
                  </button>
                )}
              </div>
            ))}
          </div>

          {/* Summary for bulk */}
          {results.length > 1 && (
            <div className="mt-3 pt-3 border-t border-gray-200 text-sm text-gray-600">
              {results.filter(r => r.status === 'success').length} succeeded,{' '}
              {results.filter(r => r.status === 'failed').length} failed
            </div>
          )}
        </div>
      )}

      {/* Tips */}
      <div className="card p-5 bg-brand-50 border-brand-200">
        <h3 className="font-semibold text-brand-700 mb-2">💡 Import Tips</h3>
        <ul className="space-y-1 text-sm text-brand-800">
          <li>• Recipes with structured data (most major sites) import instantly</li>
          <li>• Blog recipes fall back to AI extraction — takes a few seconds longer</li>
          <li>• You can edit any recipe after import to fix details</li>
          <li>• Proteins and cuisines are auto-tagged for the meal planner</li>
        </ul>
      </div>
    </div>
  );
}
