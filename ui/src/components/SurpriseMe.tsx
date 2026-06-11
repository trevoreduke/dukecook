'use client';

// Surprise Me — the decision-fatigue killer (DESIGN.md §3.4).
// A modal with three moods; the pick animates in via framer-motion.

import { useState } from 'react';
import Link from 'next/link';
import { AnimatePresence, motion } from 'framer-motion';
import { surpriseMe } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

type Mode = 'favorites' | 'new';

export default function SurpriseMe({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [spinning, setSpinning] = useState(false);
  const [pick, setPick] = useState<any>(null);
  const [lastMode, setLastMode] = useState<Mode>('favorites');
  const [seen, setSeen] = useState<number[]>([]);
  const [error, setError] = useState<string | null>(null);

  const spin = async (mode: Mode, excludeCurrent = false) => {
    setSpinning(true);
    setError(null);
    setLastMode(mode);
    const exclude = excludeCurrent && pick ? [...seen, pick.recipe_id] : seen;
    try {
      // small theatrical delay so the spin feels like a spin
      const [result] = await Promise.all([
        surpriseMe(mode, { exclude_ids: exclude }),
        new Promise((r) => setTimeout(r, 600)),
      ]);
      setPick(result);
      setSeen([...exclude, result.recipe_id]);
    } catch (e: any) {
      setPick(null);
      const msg = String(e?.message || '');
      setError(
        msg.includes('404')
          ? (mode === 'favorites'
              ? (es ? 'Aún no hay favoritos de 4★ — ¡califiquen algunas cenas!' : 'No 4★ favorites yet — rate some dinners first!')
              : (es ? 'Ya probaron todo — ¡importen algo nuevo!' : "You've tried everything — import something new!"))
          : (es ? 'Algo salió mal — intenta de nuevo' : 'Something went wrong — try again')
      );
    } finally {
      setSpinning(false);
    }
  };

  const img = pick ? (pick.image_path || pick.image_url) : null;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.9, y: 20 }}
            className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold">🎲 {es ? '¡Sorpréndeme!' : 'Surprise Me!'}</h2>
              <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl">×</button>
            </div>

            {!pick && !spinning && !error && (
              <p className="text-gray-500 text-sm mb-4">
                {es ? '¿No saben qué cocinar? Dejen que decida la suerte.' : "Can't decide what to cook? Let fate pick."}
              </p>
            )}

            <div className="grid grid-cols-2 gap-2 mb-4">
              <button onClick={() => spin('favorites')} disabled={spinning}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors ${lastMode === 'favorites' && (pick || spinning) ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}>
                ⭐ {es ? 'Un favorito' : 'A favorite'}
                <div className="text-xs text-gray-400 font-normal">{es ? 'algo que les encantó' : 'something you loved'}</div>
              </button>
              <button onClick={() => spin('new')} disabled={spinning}
                className={`p-3 rounded-xl border-2 text-sm font-medium transition-colors ${lastMode === 'new' && (pick || spinning) ? 'border-brand-400 bg-brand-50' : 'border-gray-200 hover:border-brand-300'}`}>
                ✨ {es ? 'Algo nuevo' : 'Something new'}
                <div className="text-xs text-gray-400 font-normal">{es ? 'nunca cocinado' : 'never cooked'}</div>
              </button>
            </div>

            <div className="min-h-[180px] flex items-center justify-center">
              {spinning && (
                <motion.div
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 0.7, ease: 'linear' }}
                  className="text-5xl"
                >
                  🎲
                </motion.div>
              )}

              {!spinning && error && (
                <p className="text-sm text-gray-500 text-center px-4">{error}</p>
              )}

              {!spinning && !error && pick && (
                <motion.div
                  key={pick.recipe_id}
                  initial={{ opacity: 0, y: 10, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  className="w-full"
                >
                  <Link href={`/recipes/${pick.recipe_id}`} onClick={onClose}
                    className="block rounded-xl overflow-hidden border border-gray-200 hover:shadow-md transition-shadow">
                    {img && <img src={img} alt="" className="w-full h-36 object-cover" />}
                    <div className="p-3">
                      <div className="font-semibold">{pick.title}</div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[pick.cuisine, pick.total_time_min ? `${pick.total_time_min} min` : null]
                          .filter(Boolean).join(' · ')}
                        {pick.avg_stars ? ` · ⭐ ${pick.avg_stars}` : ''}
                      </div>
                      <div className="text-sm text-brand-600 mt-2">🎯 {pick.reason}</div>
                    </div>
                  </Link>
                </motion.div>
              )}

              {!spinning && !error && !pick && (
                <div className="text-5xl opacity-30">🎲</div>
              )}
            </div>

            {pick && !spinning && (
              <div className="flex gap-2 mt-4">
                <button onClick={() => spin(lastMode, true)} className="btn-secondary flex-1">
                  🔄 {es ? 'Otra vez' : 'Spin again'}
                </button>
                <Link href={`/recipes/${pick.recipe_id}`} onClick={onClose} className="btn-primary flex-1 text-center">
                  {es ? '¡Esa! →' : "That's the one →"}
                </Link>
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
