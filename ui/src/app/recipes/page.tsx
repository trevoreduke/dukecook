'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getRecipes, getAllTags } from '@/lib/api';

export default function RecipesPage() {
  const [recipes, setRecipes] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [cuisine, setCuisine] = useState('');
  const [tag, setTag] = useState('');
  const [tags, setTags] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const loadRecipes = async () => {
    setLoading(true);
    const params: Record<string, string> = { limit: '100' };
    if (search) params.search = search;
    if (cuisine) params.cuisine = cuisine;
    if (tag) params.tag = tag;
    const data = await getRecipes(params).catch(() => []);
    setRecipes(data);
    setLoading(false);
  };

  useEffect(() => { loadRecipes(); }, [search, cuisine, tag]);
  useEffect(() => { getAllTags().then(setTags).catch(() => {}); }, []);

  const cuisines = [...new Set(tags.filter(t => t.type === 'cuisine').map(t => t.name))];
  const proteins = [...new Set(tags.filter(t => t.type === 'protein').map(t => t.name))];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">📖 Recipes</h1>
        <Link href="/recipes/import" className="btn-primary">+ Import</Link>
      </div>

      {/* Filters */}
      <div className="card p-4">
        <div className="flex flex-wrap gap-3">
          <input
            className="input flex-1 min-w-[200px]"
            placeholder="Search recipes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select className="input w-auto" value={cuisine} onChange={(e) => setCuisine(e.target.value)}>
            <option value="">All Cuisines</option>
            {cuisines.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
          <select className="input w-auto" value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">All Tags</option>
            {proteins.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
        </div>
      </div>

      {/* Recipe Grid */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading recipes...</div>
      ) : recipes.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📭</div>
          <h3 className="text-lg font-medium mb-2">No recipes yet!</h3>
          <p className="text-gray-500 mb-4">Import your first recipe to get started.</p>
          <Link href="/recipes/import" className="btn-primary">Import a Recipe</Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {recipes.map((r) => (
            <Link key={r.id} href={`/recipes/${r.id}`} className="card hover:shadow-md transition-shadow">
              {/* Image */}
              <div className="h-40 bg-brand-100 flex items-center justify-center overflow-hidden">
                {r.image_url || r.image_path ? (
                  <img
                    src={r.image_path || r.image_url}
                    alt={r.title}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-4xl">🍽️</span>
                )}
              </div>

              {/* Info */}
              <div className="p-4">
                <h3 className="font-semibold text-lg mb-1 line-clamp-2">{r.title}</h3>

                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                  {r.cuisine && <span className="badge bg-brand-100 text-brand-700">{r.cuisine}</span>}
                  {r.total_time_min && <span>⏱ {r.total_time_min} min</span>}
                  {r.difficulty && <span className="capitalize">{r.difficulty}</span>}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-2">
                  {r.avg_rating ? (
                    <>
                      <span className="text-yellow-500">{'★'.repeat(Math.round(r.avg_rating))}{'☆'.repeat(5 - Math.round(r.avg_rating))}</span>
                      <span className="text-xs text-gray-400">({r.rating_count})</span>
                    </>
                  ) : (
                    <span className="text-xs text-gray-400">No ratings yet</span>
                  )}
                </div>

                {/* Tags */}
                {r.tags?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {r.tags.slice(0, 4).map((t: any) => (
                      <span key={t.id} className="badge bg-gray-100 text-gray-600">{t.name}</span>
                    ))}
                    {r.tags.length > 4 && <span className="badge bg-gray-100 text-gray-400">+{r.tags.length - 4}</span>}
                  </div>
                )}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
