'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { getRecipes, createGuestMenu, checkSlug } from '@/lib/api';

const THEME_SUGGESTIONS = [
  'Fine Dining',
  'Summer Garden Party',
  'Cozy Winter Evening',
  'Wine Tasting Dinner',
  'BBQ Cookout',
  'Kids Birthday Party',
  'Date Night',
  'Holiday Feast',
  'Mediterranean Evening',
  'Asian Fusion Night',
];

export default function CreateMenuPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);

  // Step 1: Recipe selection
  const [recipes, setRecipes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<any[]>([]);
  const [recipesLoading, setRecipesLoading] = useState(true);

  // Step 2: Title & theme
  const [title, setTitle] = useState('');
  const [themePrompt, setThemePrompt] = useState('');

  // Step 3: Slug & create
  const [slug, setSlug] = useState('');
  const [slugAvailable, setSlugAvailable] = useState<boolean | null>(null);
  const [slugChecking, setSlugChecking] = useState(false);

  // Shared
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    getRecipes({ limit: '200' })
      .then(setRecipes)
      .catch(() => [])
      .finally(() => setRecipesLoading(false));
  }, []);

  const filteredRecipes = recipes.filter((r) =>
    r.title.toLowerCase().includes(search.toLowerCase()) && !r.archived
  );

  const toggleRecipe = (recipe: any) => {
    if (selected.find((s) => s.id === recipe.id)) {
      setSelected(selected.filter((s) => s.id !== recipe.id));
    } else {
      setSelected([...selected, recipe]);
    }
  };

  // Auto-generate slug from title
  useEffect(() => {
    if (title && !slug) {
      const autoSlug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
      setSlug(autoSlug);
    }
  }, [title]);

  // Check slug availability with debounce
  useEffect(() => {
    if (!slug || slug.length < 3) {
      setSlugAvailable(null);
      return;
    }
    setSlugChecking(true);
    const timer = setTimeout(() => {
      checkSlug(slug)
        .then((res) => setSlugAvailable(res.available))
        .catch(() => setSlugAvailable(null))
        .finally(() => setSlugChecking(false));
    }, 400);
    return () => clearTimeout(timer);
  }, [slug]);

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    try {
      const result = await createGuestMenu({
        title,
        slug: slug || undefined,
        theme_prompt: themePrompt,
        recipe_ids: selected.map((r) => r.id),
      });
      router.push(`/menus/${result.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to create menu');
      setCreating(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 mb-2">
        <Link href="/menus" className="text-gray-400 hover:text-gray-600">← Back</Link>
        <h1 className="text-2xl font-bold">Create Guest Menu</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-2 mb-6">
        {[1, 2, 3].map((s) => (
          <div key={s} className="flex items-center gap-2">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${
              s === step ? 'bg-brand-500 text-white' : s < step ? 'bg-green-500 text-white' : 'bg-gray-200 text-gray-500'
            }`}>
              {s < step ? '✓' : s}
            </div>
            <span className={`text-sm ${s === step ? 'font-medium' : 'text-gray-400'}`}>
              {s === 1 ? 'Select Recipes' : s === 2 ? 'Theme & Title' : 'Slug & Create'}
            </span>
            {s < 3 && <div className="w-8 h-0.5 bg-gray-200" />}
          </div>
        ))}
      </div>

      {/* Step 1: Select Recipes */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="card p-4">
            <h2 className="font-semibold mb-3">Select recipes for your menu</h2>
            <input
              className="input mb-3"
              placeholder="Search recipes..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            {/* Selected chips */}
            {selected.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3 p-3 bg-green-50 rounded-lg">
                {selected.map((r) => (
                  <button
                    key={r.id}
                    onClick={() => toggleRecipe(r)}
                    className="flex items-center gap-1 px-3 py-1 bg-green-100 text-green-700 rounded-full text-sm hover:bg-green-200"
                  >
                    {r.title} ×
                  </button>
                ))}
              </div>
            )}

            {recipesLoading ? (
              <div className="text-center py-4 text-gray-400">Loading recipes...</div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 max-h-[400px] overflow-y-auto">
                {filteredRecipes.map((r) => {
                  const isSelected = selected.find((s) => s.id === r.id);
                  return (
                    <button
                      key={r.id}
                      onClick={() => toggleRecipe(r)}
                      className={`text-left p-3 rounded-lg border-2 transition-all ${
                        isSelected
                          ? 'border-green-400 bg-green-50'
                          : 'border-gray-200 hover:border-brand-300'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-12 h-12 rounded bg-brand-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                          {r.image_path || r.image_url ? (
                            <img src={r.image_path || r.image_url} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <span className="text-xl">🍽️</span>
                          )}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-sm truncate">{r.title}</div>
                          <div className="text-xs text-gray-400">
                            {r.cuisine && <span>{r.cuisine}</span>}
                            {r.total_time_min && <span> · {r.total_time_min}min</span>}
                          </div>
                        </div>
                        {isSelected && <span className="text-green-500 text-lg">✓</span>}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex justify-end">
            <button
              onClick={() => setStep(2)}
              disabled={selected.length < 2}
              className="btn-primary disabled:opacity-50"
            >
              Next: Theme & Title ({selected.length} selected)
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Theme & Title */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="card p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Menu Title</label>
              <input
                className="input"
                placeholder="e.g. Summer Wine Dinner"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
            </div>

            <div>
              <label className="block text-sm font-medium mb-1">Theme Description</label>
              <textarea
                className="input min-h-[80px]"
                placeholder="Describe the vibe... e.g. Elegant summer evening with wine pairings, warm golden tones, romantic candlelit atmosphere"
                value={themePrompt}
                onChange={(e) => setThemePrompt(e.target.value)}
              />
            </div>

            {/* Quick suggestions */}
            <div>
              <label className="block text-sm font-medium mb-2">Quick Themes</label>
              <div className="flex flex-wrap gap-2">
                {THEME_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    onClick={() => {
                      setThemePrompt(s);
                      if (!title) setTitle(s);
                    }}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                      themePrompt === s
                        ? 'border-brand-400 bg-brand-50 text-brand-700'
                        : 'border-gray-200 hover:border-brand-300 text-gray-600'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>

            {/* Selected recipes summary */}
            <div className="bg-gray-50 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-500 mb-2">Selected Recipes ({selected.length})</div>
              <div className="flex flex-wrap gap-2">
                {selected.map((r) => (
                  <span key={r.id} className="px-2 py-1 bg-white rounded text-sm text-gray-700 border border-gray-200">
                    {r.title}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(1)} className="px-4 py-2 text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={() => setStep(3)}
              disabled={!title}
              className="btn-primary disabled:opacity-50"
            >
              Next: Set URL
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Slug & Create */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="card p-4 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Custom URL</label>
              <div className="flex items-center gap-2">
                <span className="text-sm text-gray-400">cook.trevorduke.com/m/</span>
                <input
                  className="input flex-1"
                  placeholder="summer-wine-dinner"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
                />
              </div>
              <div className="mt-1 text-sm">
                {slugChecking ? (
                  <span className="text-gray-400">Checking...</span>
                ) : slugAvailable === true ? (
                  <span className="text-green-600">✓ Available</span>
                ) : slugAvailable === false ? (
                  <span className="text-red-600">✗ Already taken</span>
                ) : slug.length > 0 && slug.length < 3 ? (
                  <span className="text-amber-600">Slug must be at least 3 characters</span>
                ) : null}
              </div>
            </div>

            {/* Summary */}
            <div className="bg-gray-50 rounded-lg p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Title</span>
                <span className="font-medium">{title}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Theme</span>
                <span className="font-medium truncate max-w-[250px]">{themePrompt || '(default)'}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">Recipes</span>
                <span className="font-medium">{selected.length} selected</span>
              </div>
            </div>

            {error && (
              <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>
            )}
          </div>

          <div className="flex justify-between">
            <button onClick={() => setStep(2)} className="px-4 py-2 text-gray-500 hover:text-gray-700">
              ← Back
            </button>
            <button
              onClick={handleCreate}
              disabled={creating || !title || !slug || slug.length < 3 || slugAvailable === false}
              className="btn-primary disabled:opacity-50"
            >
              {creating ? (
                <span className="flex items-center gap-2">
                  <span className="animate-spin">⟳</span> Claude is designing your menu...
                </span>
              ) : (
                'Create & Share'
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
