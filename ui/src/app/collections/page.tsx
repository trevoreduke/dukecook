'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getCollections, createCollection } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const EMOJI_CHOICES = ['📚', '💕', '⚡', '🎉', '🥗', '🍝', '🌮', '🍲', '👶', '🧑‍🍳', '☀️', '❄️'];

const STARTER_IDEAS = [
  { en: 'Date Night Dinners', es: 'Cenas Románticas', emoji: '💕' },
  { en: 'Under 30 Minutes', es: 'Menos de 30 Minutos', emoji: '⚡' },
  { en: 'Impress the Guests', es: 'Para Impresionar', emoji: '🎉' },
  { en: 'Meal Prep Sundays', es: 'Prep de Domingo', emoji: '🍲' },
];

export default function CollectionsPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [collections, setCollections] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [newEmoji, setNewEmoji] = useState('📚');

  const reload = () => getCollections().then((c) => { setCollections(c); setLoading(false); }).catch(() => setLoading(false));
  useEffect(() => { reload(); }, []);

  const handleCreate = async (name?: string, emoji?: string) => {
    const n = (name ?? newName).trim();
    if (!n) return;
    await createCollection({ name: n, emoji: emoji ?? newEmoji }).catch(() => alert(es ? 'Error al crear' : 'Failed to create'));
    setNewName('');
    setCreating(false);
    reload();
  };

  if (loading) return <div className="text-center py-12 text-gray-400">{es ? 'Cargando…' : 'Loading…'}</div>;

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-indigo-500 to-purple-600 text-white">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold mb-1">📚 {es ? 'Colecciones' : 'Collections'}</h1>
            <p className="text-indigo-100">{es ? 'Agrupa recetas por tema y compártelas' : 'Group recipes by theme & share them'}</p>
          </div>
          <button onClick={() => setCreating(!creating)} className="bg-white/20 hover:bg-white/30 px-4 py-2 rounded-lg font-medium">
            + {es ? 'Nueva' : 'New'}
          </button>
        </div>
      </div>

      {creating && (
        <div className="card p-5">
          <div className="flex flex-wrap items-center gap-2 mb-3">
            {EMOJI_CHOICES.map((e) => (
              <button key={e} onClick={() => setNewEmoji(e)}
                className={`text-2xl p-1.5 rounded-lg ${newEmoji === e ? 'bg-brand-100 ring-2 ring-brand-400' : 'hover:bg-gray-50'}`}>
                {e}
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={es ? 'Nombre de la colección…' : 'Collection name…'}
              autoFocus
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button onClick={() => handleCreate()} className="btn-primary">{es ? 'Crear' : 'Create'}</button>
          </div>
        </div>
      )}

      {collections.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">📚</div>
          <h3 className="text-lg font-medium mb-2">{es ? 'Aún no hay colecciones' : 'No collections yet'}</h3>
          <p className="text-gray-500 mb-4 text-sm">{es ? 'Empieza con una de estas:' : 'Start with one of these:'}</p>
          <div className="flex flex-wrap gap-2 justify-center">
            {STARTER_IDEAS.map((s) => (
              <button key={s.en} onClick={() => handleCreate(es ? s.es : s.en, s.emoji)}
                className="px-3 py-2 bg-gray-50 hover:bg-brand-50 border border-gray-200 rounded-lg text-sm">
                {s.emoji} {es ? s.es : s.en}
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {collections.map((c) => (
            <Link key={c.id} href={`/collections/${c.id}`}
              className="card p-5 hover:shadow-md transition-shadow">
              <div className="flex items-start gap-3">
                <div className="text-3xl">{c.emoji}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold truncate">{c.name}</div>
                  <div className="text-sm text-gray-500">
                    {c.recipe_count} {es ? 'recetas' : c.recipe_count === 1 ? 'recipe' : 'recipes'}
                  </div>
                </div>
              </div>
              {c.covers?.length > 0 && (
                <div className="flex gap-1.5 mt-3">
                  {c.covers.map((img: string, i: number) => (
                    <img key={i} src={img} alt="" className="w-16 h-16 rounded-lg object-cover" />
                  ))}
                </div>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
