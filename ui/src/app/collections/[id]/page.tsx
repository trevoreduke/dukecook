'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import {
  getCollection, deleteCollection, removeRecipeFromCollection,
  addRecipeToCollection, getRecipes,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function CollectionDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { locale } = useI18n();
  const es = locale === 'es';
  const [collection, setCollection] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [adding, setAdding] = useState(false);
  const [search, setSearch] = useState('');
  const [allRecipes, setAllRecipes] = useState<any[]>([]);

  const reload = () =>
    getCollection(Number(id)).then((c) => { setCollection(c); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { reload(); }, [id]);

  useEffect(() => {
    if (adding && allRecipes.length === 0) {
      getRecipes({ limit: '500' }).then(setAllRecipes).catch(() => {});
    }
  }, [adding]);

  const share = async () => {
    const url = `${window.location.origin}/c/${collection.slug}`;
    try {
      if (navigator.share) { await navigator.share({ title: collection.name, url }); return; }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* user cancelled */ }
  };

  const handleDelete = async () => {
    if (!confirm(es ? '¿Eliminar esta colección? (las recetas no se borran)' : 'Delete this collection? (recipes themselves are kept)')) return;
    await deleteCollection(Number(id)).catch(() => {});
    router.push('/collections');
  };

  const handleRemove = async (recipeId: number) => {
    await removeRecipeFromCollection(Number(id), recipeId).catch(() => {});
    reload();
  };

  const handleAdd = async (recipeId: number) => {
    await addRecipeToCollection(Number(id), recipeId).catch(() => {});
    reload();
  };

  if (loading) return <div className="text-center py-12 text-gray-400">{es ? 'Cargando…' : 'Loading…'}</div>;
  if (!collection) return <div className="text-center py-12 text-gray-400">{es ? 'Colección no encontrada' : 'Collection not found'}</div>;

  const inCollection = new Set(collection.recipes.map((r: any) => r.recipe_id));
  const addCandidates = allRecipes.filter((r) =>
    !inCollection.has(r.id) &&
    (!search || r.title.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href="/collections" className="text-indigo-200 text-sm hover:text-white">← {es ? 'Colecciones' : 'Collections'}</Link>
            <h1 className="text-2xl font-bold mt-1 truncate">{collection.emoji} {collection.name}</h1>
            {collection.description && <p className="text-indigo-100 mt-1">{collection.description}</p>}
          </div>
          <div className="flex gap-2 flex-shrink-0">
            <button onClick={share} className="bg-white/20 hover:bg-white/30 px-3 py-2 rounded-lg text-sm font-medium">
              {copied ? '✓' : '🔗'} {copied ? (es ? 'Copiado' : 'Copied') : (es ? 'Compartir' : 'Share')}
            </button>
            <button onClick={handleDelete} className="bg-white/10 hover:bg-red-500/60 px-3 py-2 rounded-lg text-sm">🗑</button>
          </div>
        </div>
      </div>

      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">{collection.recipes.length} {es ? 'recetas' : 'recipes'}</h2>
          <button onClick={() => setAdding(!adding)} className="btn-secondary text-sm">
            {adding ? (es ? 'Listo' : 'Done') : `+ ${es ? 'Agregar recetas' : 'Add recipes'}`}
          </button>
        </div>

        {adding && (
          <div className="mb-4 p-3 bg-gray-50 rounded-lg">
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={es ? 'Buscar recetas…' : 'Search recipes…'}
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <div className="max-h-64 overflow-y-auto space-y-1">
              {addCandidates.slice(0, 30).map((r) => (
                <button key={r.id} onClick={() => handleAdd(r.id)}
                  className="w-full flex items-center gap-2 p-2 rounded-lg hover:bg-white text-left text-sm">
                  <span className="text-brand-500 font-bold">+</span>
                  <span className="truncate">{r.title}</span>
                </button>
              ))}
              {addCandidates.length === 0 && <p className="text-sm text-gray-400 p-2">{es ? 'Sin resultados' : 'No matches'}</p>}
            </div>
          </div>
        )}

        {collection.recipes.length === 0 ? (
          <p className="text-sm text-gray-400 py-6 text-center">{es ? 'Vacía — agrega recetas arriba.' : 'Empty — add some recipes above.'}</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {collection.recipes.map((r: any) => {
              const img = r.image_path || r.image_url;
              return (
                <div key={r.recipe_id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 group">
                  <Link href={`/recipes/${r.recipe_id}`} className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
                      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : '🍽️'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">{r.title}</div>
                      <div className="text-xs text-gray-500">
                        {r.cuisine}{r.total_time_min ? ` · ${r.total_time_min} min` : ''}{r.avg_stars ? ` · ⭐ ${r.avg_stars}` : ''}
                      </div>
                    </div>
                  </Link>
                  <button onClick={() => handleRemove(r.recipe_id)}
                    className="text-gray-300 hover:text-red-500 px-2 opacity-0 group-hover:opacity-100 transition-opacity">×</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
