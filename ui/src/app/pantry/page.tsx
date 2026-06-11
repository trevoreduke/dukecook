'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import {
  getPantry, addPantryItem, deletePantryItem, clearPantry,
  scanPantryPhoto, getCanCook,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const CATEGORY_META: Record<string, { emoji: string; en: string; es: string }> = {
  produce: { emoji: '🥬', en: 'Produce', es: 'Frutas y Verduras' },
  dairy: { emoji: '🥛', en: 'Dairy', es: 'Lácteos' },
  meat: { emoji: '🥩', en: 'Meat & Fish', es: 'Carnes y Pescados' },
  pantry: { emoji: '🥫', en: 'Pantry', es: 'Despensa' },
  spice: { emoji: '🧂', en: 'Spices', es: 'Especias' },
  frozen: { emoji: '🧊', en: 'Frozen', es: 'Congelados' },
  bakery: { emoji: '🍞', en: 'Bakery', es: 'Panadería' },
  other: { emoji: '🧺', en: 'Other', es: 'Otros' },
};

function CanCookCard({ r, es }: { r: any; es: boolean }) {
  const img = r.image_path || r.image_url;
  return (
    <Link href={`/recipes/${r.recipe_id}`}
      className="flex items-center gap-3 p-2 rounded-lg bg-white hover:bg-green-50 transition-colors border border-gray-100">
      <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
        {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : '🍽️'}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate">{r.title}</div>
        <div className="text-xs text-gray-500">
          {r.total_time_min ? `${r.total_time_min} min · ` : ''}
          {r.missing_count === 0
            ? (es ? '¡Tienes todo!' : 'You have everything!')
            : (es ? `Solo falta: ${r.missing.join(', ')}` : `Just need: ${r.missing.join(', ')}`)}
        </div>
      </div>
      {r.missing_count === 0 && <span className="text-green-500 text-lg">✓</span>}
    </Link>
  );
}

export default function PantryPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [items, setItems] = useState<any[]>([]);
  const [canCook, setCanCook] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [scanResult, setScanResult] = useState<string | null>(null);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState('other');
  const fileRef = useRef<HTMLInputElement>(null);

  const reload = async () => {
    const [p, cc] = await Promise.all([
      getPantry().catch(() => []),
      getCanCook().catch(() => null),
    ]);
    setItems(p);
    setCanCook(cc);
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    try {
      await addPantryItem({ name: newName.trim(), category: newCategory });
      setNewName('');
      reload();
    } catch (e: any) {
      alert(e.message?.includes('409') ? (es ? 'Ya está en la despensa' : 'Already in the pantry') : (es ? 'Error al agregar' : 'Failed to add'));
    }
  };

  const handleDelete = async (id: number) => {
    await deletePantryItem(id).catch(() => {});
    reload();
  };

  const handleClear = async () => {
    if (!confirm(es ? '¿Vaciar toda la despensa?' : 'Clear the whole pantry inventory?')) return;
    await clearPantry().catch(() => {});
    reload();
  };

  const handlePhoto = async (file: File | undefined) => {
    if (!file) return;
    setScanning(true);
    setScanResult(null);
    try {
      const result = await scanPantryPhoto(file);
      setScanResult(
        es
          ? `✓ ${result.added.length} nuevos, ${result.updated.length} actualizados`
          : `✓ Found ${result.total_found}: ${result.added.length} new, ${result.updated.length} refreshed`
      );
      reload();
    } catch (e) {
      setScanResult(es ? '✗ No se pudo leer la foto — intenta una más clara' : '✗ Could not read the photo — try a clearer shot');
    } finally {
      setScanning(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">{es ? 'Cargando…' : 'Loading…'}</div>;

  const byCategory: Record<string, any[]> = {};
  items.forEach((i) => { (byCategory[i.category] ||= []).push(i); });

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-green-500 to-emerald-600 text-white">
        <h1 className="text-2xl font-bold mb-1">🥫 {es ? '¿Qué Puedo Cocinar?' : 'What Can I Cook?'}</h1>
        <p className="text-green-100">
          {es ? 'Foto de tu refri o despensa → recetas que puedes hacer ya' : 'Snap your fridge or pantry → recipes you can make right now'}
        </p>
      </div>

      {/* Scan + add */}
      <div className="card p-5">
        <div className="flex flex-wrap items-center gap-3">
          <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
            onChange={(e) => handlePhoto(e.target.files?.[0])} />
          <button onClick={() => fileRef.current?.click()} disabled={scanning} className="btn-primary">
            {scanning ? (es ? '🔍 Escaneando…' : '🔍 Scanning…') : (es ? '📸 Escanear Foto' : '📸 Scan a Photo')}
          </button>
          <div className="flex items-center gap-2 flex-1 min-w-[220px]">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              placeholder={es ? 'Agregar a mano… (ej. crema)' : 'Add by hand… (e.g. heavy cream)'}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-brand-300"
            />
            <select value={newCategory} onChange={(e) => setNewCategory(e.target.value)}
              className="px-2 py-2 border border-gray-200 rounded-lg text-sm">
              {Object.entries(CATEGORY_META).map(([k, m]) => (
                <option key={k} value={k}>{m.emoji} {es ? m.es : m.en}</option>
              ))}
            </select>
            <button onClick={handleAdd} className="btn-secondary">+</button>
          </div>
        </div>
        {scanResult && <div className="mt-3 text-sm text-gray-600">{scanResult}</div>}
        {scanning && (
          <div className="mt-3 text-sm text-gray-400 animate-pulse">
            {es ? 'Claude está mirando tu refri…' : 'Claude is looking through your fridge…'}
          </div>
        )}
      </div>

      {/* Can cook results */}
      {canCook && (canCook.ready.length > 0 || canCook.close.length > 0) && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="card p-5 border-2 border-green-200">
            <h2 className="text-lg font-semibold mb-3">✅ {es ? 'Listas para cocinar' : 'Ready to cook'} ({canCook.ready.length})</h2>
            <div className="space-y-2">
              {canCook.ready.length === 0
                ? <p className="text-sm text-gray-400">{es ? 'Nada completo todavía — agrega más artículos' : 'Nothing fully covered yet — add more items'}</p>
                : canCook.ready.slice(0, 10).map((r: any) => <CanCookCard key={r.recipe_id} r={r} es={es} />)}
            </div>
          </div>
          <div className="card p-5 border-2 border-yellow-200">
            <h2 className="text-lg font-semibold mb-3">🛒 {es ? 'Falta poco (1–2 cosas)' : 'So close (1–2 items)'} ({canCook.close.length})</h2>
            <div className="space-y-2">
              {canCook.close.slice(0, 10).map((r: any) => <CanCookCard key={r.recipe_id} r={r} es={es} />)}
            </div>
          </div>
        </div>
      )}

      {/* Inventory */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">
            {es ? 'Inventario' : 'Inventory'} <span className="text-gray-400 text-sm">({items.length})</span>
          </h2>
          {items.length > 0 && (
            <button onClick={handleClear} className="text-sm text-red-400 hover:text-red-600">
              {es ? 'Vaciar todo' : 'Clear all'}
            </button>
          )}
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-gray-400 py-4 text-center">
            {es ? 'Despensa vacía — escanea una foto o agrega artículos arriba.' : 'Pantry is empty — scan a photo or add items above. Staples (salt, oil, rice…) are always assumed.'}
          </p>
        ) : (
          <div className="space-y-4">
            {Object.entries(CATEGORY_META).filter(([k]) => byCategory[k]?.length).map(([k, meta]) => (
              <div key={k}>
                <div className="text-xs text-gray-400 uppercase tracking-wide mb-1.5">
                  {meta.emoji} {es ? meta.es : meta.en}
                </div>
                <div className="flex flex-wrap gap-2">
                  {byCategory[k].map((i) => (
                    <span key={i.id}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-50 border border-gray-200 rounded-full text-sm group"
                      title={i.source === 'photo' ? `${es ? 'De foto' : 'From photo'}${i.confidence ? ` (${Math.round(i.confidence * 100)}%)` : ''}` : (es ? 'Manual' : 'Manual')}>
                      {i.name}
                      {i.quantity_text && <span className="text-gray-400 text-xs">({i.quantity_text})</span>}
                      {i.source === 'photo' && <span className="text-xs">📸</span>}
                      <button onClick={() => handleDelete(i.id)}
                        className="text-gray-300 hover:text-red-500 ml-0.5">×</button>
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
        <p className="text-xs text-gray-400 mt-4">
          {es
            ? 'Los básicos (sal, aceite, arroz, huevos…) siempre se asumen disponibles.'
            : 'Staples (salt, oil, rice, eggs…) are always assumed on hand and don\'t need to be added.'}
        </p>
      </div>
    </div>
  );
}
