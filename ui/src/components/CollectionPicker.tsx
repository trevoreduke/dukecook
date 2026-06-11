'use client';

// "Save to collection" popover for the recipe page — toggle membership in
// any collection, or create one inline.

import { useState, useEffect, useRef } from 'react';
import {
  getCollections, getRecipeMemberships, addRecipeToCollection,
  removeRecipeFromCollection, createCollection,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function CollectionPicker({ recipeId }: { recipeId: number }) {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [open, setOpen] = useState(false);
  const [collections, setCollections] = useState<any[]>([]);
  const [memberIds, setMemberIds] = useState<Set<number>>(new Set());
  const [newName, setNewName] = useState('');
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    Promise.all([getCollections(), getRecipeMemberships(recipeId)])
      .then(([c, m]) => {
        setCollections(c);
        setMemberIds(new Set(m.collection_ids));
      })
      .catch(() => {});
  }, [open, recipeId]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const toggle = async (collectionId: number) => {
    const next = new Set(memberIds);
    try {
      if (next.has(collectionId)) {
        await removeRecipeFromCollection(collectionId, recipeId);
        next.delete(collectionId);
      } else {
        await addRecipeToCollection(collectionId, recipeId);
        next.add(collectionId);
      }
      setMemberIds(next);
    } catch { /* leave state as-is */ }
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const c = await createCollection({ name });
      await addRecipeToCollection(c.id, recipeId);
      setNewName('');
      const [list, m] = await Promise.all([getCollections(), getRecipeMemberships(recipeId)]);
      setCollections(list);
      setMemberIds(new Set(m.collection_ids));
    } catch { /* noop */ }
  };

  const count = memberIds.size;

  return (
    <div className="relative" ref={wrapRef}>
      <button onClick={() => setOpen(!open)}
        className={`btn-secondary ${open || count > 0 ? 'ring-2 ring-brand-300' : ''}`}>
        📚 {es ? 'Guardar' : 'Save'}{count > 0 ? ` (${count})` : ''}
      </button>
      {open && (
        <div className="absolute z-40 mt-2 w-64 bg-white rounded-xl shadow-xl border border-gray-100 p-2">
          <div className="text-xs text-gray-400 uppercase tracking-wide px-2 py-1">
            {es ? 'Colecciones' : 'Collections'}
          </div>
          <div className="max-h-56 overflow-y-auto">
            {collections.length === 0 && (
              <p className="text-sm text-gray-400 px-2 py-2">{es ? 'Aún no hay — crea una abajo' : 'None yet — create one below'}</p>
            )}
            {collections.map((c) => (
              <button key={c.id} onClick={() => toggle(c.id)}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-gray-50 text-left text-sm">
                <span className={`w-4 text-brand-500 ${memberIds.has(c.id) ? '' : 'opacity-0'}`}>✓</span>
                <span>{c.emoji}</span>
                <span className="truncate flex-1">{c.name}</span>
                <span className="text-xs text-gray-400">{c.recipe_count}</span>
              </button>
            ))}
          </div>
          <div className="flex gap-1 mt-1 pt-2 border-t border-gray-100">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
              placeholder={es ? 'Nueva colección…' : 'New collection…'}
              className="flex-1 px-2 py-1.5 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <button onClick={handleCreate} className="px-2.5 py-1.5 bg-brand-500 text-white rounded-lg text-sm">+</button>
          </div>
        </div>
      )}
    </div>
  );
}
