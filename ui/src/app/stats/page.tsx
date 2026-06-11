'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getStatsOverview, getStatsTimeline, getStatsProteins, getStatsCuisines,
  getMostCooked, getForgottenFavorites,
} from '@/lib/api';
import { useI18n } from '@/lib/i18n';

const PROTEIN_COLORS: Record<string, string> = {
  chicken: 'bg-amber-400', beef: 'bg-red-500', pork: 'bg-pink-400',
  salmon: 'bg-orange-400', fish: 'bg-sky-400', shrimp: 'bg-rose-400',
  tofu: 'bg-lime-400', vegetarian: 'bg-green-500', other: 'bg-gray-400',
};

function RecipeThumb({ r }: { r: any }) {
  const img = r.image_path || r.image_url;
  return (
    <div className="w-12 h-12 rounded-lg bg-brand-100 flex items-center justify-center text-xl flex-shrink-0 overflow-hidden">
      {img ? <img src={img} alt="" className="w-full h-full object-cover" /> : '🍽️'}
    </div>
  );
}

function DistBars({ data }: { data: any[] }) {
  if (!data.length) return <p className="text-sm text-gray-400 py-2">No cooks recorded yet.</p>;
  const max = data[0]?.cooks || 1;
  return (
    <div className="space-y-2">
      {data.slice(0, 8).map((d) => (
        <div key={d.name} className="flex items-center gap-2 text-sm">
          <div className="w-24 truncate capitalize text-gray-600">{d.name}</div>
          <div className="flex-1 h-5 bg-gray-100 rounded overflow-hidden">
            <div
              className={`h-full rounded ${PROTEIN_COLORS[d.name] || 'bg-brand-400'}`}
              style={{ width: `${Math.max(4, (d.cooks / max) * 100)}%` }}
            />
          </div>
          <div className="w-16 text-right text-gray-500">{d.cooks} · {d.pct}%</div>
        </div>
      ))}
    </div>
  );
}

export default function StatsPage() {
  const { locale } = useI18n();
  const es = locale === 'es';
  const [overview, setOverview] = useState<any>(null);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [proteins, setProteins] = useState<any[]>([]);
  const [cuisines, setCuisines] = useState<any[]>([]);
  const [mostCooked, setMostCooked] = useState<any[]>([]);
  const [forgotten, setForgotten] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getStatsOverview().catch(() => null),
      getStatsTimeline().catch(() => []),
      getStatsProteins().catch(() => []),
      getStatsCuisines().catch(() => []),
      getMostCooked().catch(() => []),
      getForgottenFavorites().catch(() => []),
    ]).then(([o, t, p, c, m, f]) => {
      setOverview(o); setTimeline(t); setProteins(p);
      setCuisines(c); setMostCooked(m); setForgotten(f);
      setLoading(false);
    });
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">{es ? 'Cargando…' : 'Loading…'}</div>;

  const maxWeek = Math.max(1, ...timeline.map((w) => w.cooks));
  const trendUp = overview && overview.cooks_last_30 >= overview.cooks_prior_30;

  return (
    <div className="space-y-6">
      <div className="card p-6 bg-gradient-to-r from-purple-500 to-brand-500 text-white">
        <h1 className="text-2xl font-bold mb-1">📈 {es ? 'Estadísticas de Cocina' : 'Cooking Stats'}</h1>
        <p className="text-purple-100">{es ? 'Lo que realmente han cocinado' : "What you've actually been cooking"}</p>
      </div>

      {/* Headline numbers */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-brand-600">{overview?.total_cooks ?? 0}</div>
          <div className="text-sm text-gray-500">{es ? 'Comidas cocinadas (1 año)' : 'Meals cooked (1 yr)'}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-purple-600">{overview?.distinct_recipes ?? 0}</div>
          <div className="text-sm text-gray-500">{es ? 'Recetas distintas' : 'Distinct recipes'}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-yellow-500">{overview?.avg_stars ?? '—'}</div>
          <div className="text-sm text-gray-500">{es ? 'Estrellas promedio' : 'Avg rating'}</div>
        </div>
        <div className="card p-4 text-center">
          <div className="text-3xl font-bold text-green-600">{overview?.streak_weeks ?? 0}🔥</div>
          <div className="text-sm text-gray-500">{es ? 'Racha semanal' : 'Week streak'}</div>
        </div>
      </div>

      {/* Forgotten favorites — the action item, so it goes high */}
      {forgotten.length > 0 && (
        <div className="card p-5 border-2 border-yellow-200 bg-yellow-50/50">
          <h2 className="text-lg font-semibold mb-1">💛 {es ? 'Favoritos Olvidados' : 'Forgotten Favorites'}</h2>
          <p className="text-sm text-gray-500 mb-3">
            {es ? 'Les encantaron y no los cocinan hace más de 2 meses' : "You both loved these — and haven't made them in 2+ months"}
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {forgotten.slice(0, 6).map((r) => (
              <Link key={r.recipe_id} href={`/recipes/${r.recipe_id}`}
                className="flex items-center gap-3 p-2 rounded-lg bg-white hover:bg-yellow-50 transition-colors border border-yellow-100">
                <RecipeThumb r={r} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.title}</div>
                  <div className="text-xs text-gray-500">
                    {'⭐'.repeat(Math.round(r.avg_stars))} · {r.days_since
                      ? (es ? `hace ${r.days_since} días` : `${r.days_since} days ago`)
                      : (es ? 'nunca cocinado' : 'never cooked')}
                  </div>
                </div>
                <span className="text-brand-500 text-sm whitespace-nowrap">{es ? 'Ver →' : 'View →'}</span>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Cooks per week */}
      <div className="card p-5">
        <div className="flex items-baseline justify-between mb-3">
          <h2 className="text-lg font-semibold">🗓️ {es ? 'Comidas por semana' : 'Cooks per week'}</h2>
          {overview && (
            <span className={`text-sm ${trendUp ? 'text-green-600' : 'text-red-500'}`}>
              {overview.cooks_last_30} {es ? 'últimos 30d' : 'last 30d'} {trendUp ? '▲' : '▼'} ({overview.cooks_prior_30} {es ? 'previos' : 'prior'})
            </span>
          )}
        </div>
        <div className="flex items-end gap-[3px] h-28">
          {timeline.map((w) => (
            <div key={w.week_of} className="flex-1 flex flex-col justify-end group relative">
              <div
                className={`rounded-t ${w.cooks > 0 ? 'bg-brand-400 group-hover:bg-brand-600' : 'bg-gray-100'}`}
                style={{ height: `${Math.max(4, (w.cooks / maxWeek) * 100)}%` }}
                title={`${w.week_of}: ${w.cooks}`}
              />
            </div>
          ))}
        </div>
        <div className="flex justify-between text-xs text-gray-400 mt-1">
          <span>{timeline[0]?.week_of}</span>
          <span>{es ? 'esta semana' : 'this week'}</span>
        </div>
      </div>

      {/* Distributions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="card p-5">
          <h2 className="text-lg font-semibold mb-3">🍗 {es ? 'Proteínas (90 días)' : 'Proteins (90 days)'}</h2>
          <DistBars data={proteins} />
        </div>
        <div className="card p-5">
          <h2 className="text-lg font-semibold mb-3">🌍 {es ? 'Cocinas (90 días)' : 'Cuisines (90 days)'}</h2>
          <DistBars data={cuisines} />
        </div>
      </div>

      {/* Most cooked */}
      <div className="card p-5">
        <h2 className="text-lg font-semibold mb-3">🏆 {es ? 'Más Cocinadas' : 'Most Cooked'}</h2>
        {mostCooked.length === 0 ? (
          <p className="text-sm text-gray-400">{es ? 'Aún no hay historial.' : 'No cooking history yet — rate a dinner after cooking it!'}</p>
        ) : (
          <div className="space-y-1">
            {mostCooked.map((r, i) => (
              <Link key={r.recipe_id} href={`/recipes/${r.recipe_id}`}
                className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                <div className="w-6 text-center font-bold text-gray-400">{i + 1}</div>
                <RecipeThumb r={r} />
                <div className="flex-1 min-w-0">
                  <div className="font-medium truncate">{r.title}</div>
                  <div className="text-xs text-gray-500">
                    {r.cook_count}× · {es ? 'última vez' : 'last'} {r.last_cooked}
                    {r.avg_stars ? ` · ⭐ ${r.avg_stars}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
