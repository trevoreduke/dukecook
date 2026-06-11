'use client';

// Public read-only collection view — shared via /c/<slug>, no app shell
// (layout.tsx skips the shell for /c/ like it does for guest menus at /m/).

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import { getSharedCollection } from '@/lib/api';

export default function SharedCollectionPage() {
  const { slug } = useParams<{ slug: string }>();
  const [collection, setCollection] = useState<any>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getSharedCollection(slug).then(setCollection).catch(() => setError(true));
  }, [slug]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-orange-50">
        <div className="text-center">
          <div className="text-5xl mb-4">🍳</div>
          <p className="text-gray-500">This collection doesn&apos;t exist (or the link is wrong).</p>
        </div>
      </div>
    );
  }
  if (!collection) {
    return <div className="min-h-screen flex items-center justify-center bg-orange-50 text-gray-400">Loading…</div>;
  }

  return (
    <div className="min-h-screen bg-orange-50">
      <div className="max-w-2xl mx-auto px-4 py-10">
        <div className="text-center mb-8">
          <div className="text-5xl mb-2">{collection.emoji}</div>
          <h1 className="text-3xl font-bold text-gray-800">{collection.name}</h1>
          {collection.description && <p className="text-gray-500 mt-2">{collection.description}</p>}
          <p className="text-xs text-gray-400 mt-3 uppercase tracking-wide">A DukeCook collection · {collection.recipes.length} recipes</p>
        </div>

        <div className="space-y-3">
          {collection.recipes.map((r: any) => {
            const img = r.image_path || r.image_url;
            return (
              <div key={r.recipe_id} className="bg-white rounded-xl shadow-sm p-4 flex items-center gap-4">
                <div className="w-16 h-16 rounded-lg bg-orange-100 flex items-center justify-center text-2xl flex-shrink-0 overflow-hidden">
                  {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : '🍽️'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-gray-800">{r.title}</div>
                  <div className="text-sm text-gray-500 mt-0.5">
                    {[r.cuisine, r.total_time_min ? `${r.total_time_min} min` : null, r.difficulty]
                      .filter(Boolean).join(' · ')}
                    {r.avg_stars ? ` · ⭐ ${r.avg_stars}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        <p className="text-center text-xs text-gray-400 mt-10">Made with 🍳 DukeCook</p>
      </div>
    </div>
  );
}
