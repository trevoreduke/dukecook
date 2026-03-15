'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getWeekPlan, getCurrentShoppingList } from '@/lib/api';
import { format, addDays, startOfWeek } from 'date-fns';

// ── Helpers ──────────────────────────────────────────────────────────────────

function weekStart(offset = 0) {
  const base = startOfWeek(new Date(), { weekStartsOn: 1 });
  return format(addDays(base, offset * 7), 'yyyy-MM-dd');
}

function cuisineEmoji(cuisine: string) {
  const map: Record<string, string> = {
    italian: '🇮🇹', mexican: '🌮', american: '🍔', french: '🥐', cajun: '🦐',
    asian: '🥢', mediterranean: '🫒', european: '🍖', indian: '🍛',
  };
  return map[cuisine?.toLowerCase()] ?? '🍽️';
}

function difficultyColor(difficulty: string) {
  if (difficulty === 'easy') return 'text-green-600 bg-green-50';
  if (difficulty === 'hard') return 'text-red-600 bg-red-50';
  return 'text-yellow-600 bg-yellow-50';
}

// ── Tonight Card ─────────────────────────────────────────────────────────────

function TonightCard({ meal, loading }: { meal: any | null; loading: boolean }) {
  if (loading) {
    return (
      <div className="card p-5 animate-pulse">
        <div className="h-5 bg-gray-200 rounded w-24 mb-3" />
        <div className="flex gap-4">
          <div className="w-32 h-32 bg-gray-200 rounded-xl flex-shrink-0" />
          <div className="flex-1 space-y-2">
            <div className="h-6 bg-gray-200 rounded w-3/4" />
            <div className="h-4 bg-gray-200 rounded w-1/2" />
          </div>
        </div>
      </div>
    );
  }

  if (!meal) {
    return (
      <div className="card p-5">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Tonight</h2>
        <div className="flex flex-col items-center py-6 gap-3">
          <span className="text-4xl">🤷</span>
          <p className="text-gray-500 text-center">Nothing planned for tonight yet.</p>
          <div className="flex gap-3">
            <Link href="/planner" className="btn-primary text-sm">Plan Something</Link>
            <Link href="/swipe" className="btn-secondary text-sm">🔥 Swipe</Link>
          </div>
        </div>
      </div>
    );
  }

  const totalTime = meal.recipe_total_time ?? null;
  const isCooked = meal.status === 'cooked';

  return (
    <div className="card overflow-hidden">
      {/* Hero image */}
      {meal.recipe_image && (
        <div className="relative h-48 sm:h-56 bg-gray-100 overflow-hidden">
          <img
            src={meal.recipe_image}
            alt={meal.recipe_title}
            className="w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 p-4">
            <h3 className="text-white text-xl font-bold leading-tight drop-shadow">
              {meal.recipe_title}
            </h3>
          </div>
          {isCooked && (
            <div className="absolute top-3 right-3 bg-green-500 text-white text-xs font-bold px-2.5 py-1 rounded-full">
              ✅ Cooked
            </div>
          )}
        </div>
      )}

      <div className="p-4">
        {/* Without image: show title here */}
        {!meal.recipe_image && (
          <h3 className="text-xl font-bold text-gray-800 mb-2">{meal.recipe_title}</h3>
        )}

        <div className="flex items-center gap-3 mb-4">
          {meal.recipe_cuisine && (
            <span className="text-sm text-gray-500">
              {cuisineEmoji(meal.recipe_cuisine)} {meal.recipe_cuisine}
            </span>
          )}
          {totalTime && (
            <span className="text-sm text-gray-500">⏱ {totalTime} min</span>
          )}
          {meal.recipe_difficulty && (
            <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${difficultyColor(meal.recipe_difficulty)}`}>
              {meal.recipe_difficulty}
            </span>
          )}
        </div>

        <div className="flex gap-2">
          <Link href={`/cook/${meal.recipe_id}`} className="btn-primary flex-1 text-center text-sm">
            {isCooked ? '🔄 Cook Again' : '👨‍🍳 Start Cooking'}
          </Link>
          <Link href={`/recipes/${meal.recipe_id}`} className="btn-secondary text-sm px-4">
            View Recipe
          </Link>
        </div>
      </div>
    </div>
  );
}

// ── Week Strip ────────────────────────────────────────────────────────────────

function WeekStrip({ weekPlan, label, loading }: { weekPlan: any; label: string; loading: boolean }) {
  const today = format(new Date(), 'yyyy-MM-dd');

  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-28 mb-3" />
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="h-20 bg-gray-100 rounded-lg" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="card p-4">
      <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{label}</h2>
      <div className="grid grid-cols-7 gap-1.5">
        {weekPlan?.days?.map((day: any) => {
          const isToday = day.date === today;
          const isPast = day.date < today;
          const meal = day.meals?.[0];
          const hasEvent = day.calendar_events?.length > 0;
          const isCooked = meal?.status === 'cooked';

          return (
            <Link
              key={day.date}
              href={`/planner`}
              className={`flex flex-col items-center rounded-xl p-1.5 transition-all hover:shadow-sm cursor-pointer min-h-[88px] ${
                isToday
                  ? 'bg-brand-500 text-white ring-2 ring-brand-500 ring-offset-1'
                  : isPast && meal
                  ? 'bg-green-50 hover:bg-green-100'
                  : isPast
                  ? 'bg-gray-50 opacity-50'
                  : meal
                  ? 'bg-brand-50 hover:bg-brand-100'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
            >
              {/* Day name + number */}
              <div className={`text-[10px] font-semibold uppercase ${isToday ? 'text-white/80' : 'text-gray-400'}`}>
                {day.day_name.slice(0, 3)}
              </div>
              <div className={`text-base font-bold leading-tight mb-1 ${isToday ? 'text-white' : 'text-gray-700'}`}>
                {parseInt(day.date.split('-')[2])}
              </div>

              {/* Status icon */}
              <div className="text-lg leading-none mb-1">
                {!day.available ? '🚫'
                  : isCooked ? '✅'
                  : meal ? '🍽️'
                  : hasEvent ? '📅'
                  : '—'}
              </div>

              {/* Recipe name (truncated) */}
              {meal && (
                <div className={`text-[9px] leading-tight text-center line-clamp-2 ${
                  isToday ? 'text-white/90' : isCooked ? 'text-green-700' : 'text-brand-700'
                }`}>
                  {meal.recipe_title}
                </div>
              )}
              {!meal && hasEvent && (
                <div className="text-[9px] leading-tight text-center text-gray-500 line-clamp-2">
                  {day.calendar_events[0].summary}
                </div>
              )}
            </Link>
          );
        })}
      </div>

      {/* Summary line */}
      {weekPlan?.days && (
        <div className="mt-2.5 pt-2.5 border-t border-gray-100 flex gap-4 text-xs text-gray-400">
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
            {weekPlan.days.filter((d: any) => d.meals?.[0]?.status === 'cooked').length} cooked
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-brand-400 inline-block" />
            {weekPlan.days.filter((d: any) => d.meals?.length > 0 && d.meals?.[0]?.status !== 'cooked').length} planned
          </span>
          <span className="flex items-center gap-1">
            <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
            {weekPlan.days.filter((d: any) => d.available && !d.meals?.length).length} open
          </span>
        </div>
      )}
    </div>
  );
}

// ── Shopping Widget ───────────────────────────────────────────────────────────

function ShoppingWidget({ list, loading }: { list: any; loading: boolean }) {
  if (loading) {
    return (
      <div className="card p-4 animate-pulse">
        <div className="h-4 bg-gray-200 rounded w-32 mb-3" />
        <div className="h-3 bg-gray-100 rounded-full mb-2" />
        <div className="space-y-1.5">
          {[1, 2, 3].map(i => <div key={i} className="h-4 bg-gray-100 rounded w-full" />)}
        </div>
      </div>
    );
  }

  if (!list?.items?.length) {
    return (
      <div className="card p-4">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">Shopping List</h2>
        <div className="flex flex-col items-center py-4 gap-2">
          <span className="text-3xl">🛒</span>
          <p className="text-sm text-gray-400">No active shopping list</p>
          <Link href="/shopping" className="text-sm text-brand-500 hover:underline">Create one →</Link>
        </div>
      </div>
    );
  }

  const total = list.items.length;
  const checked = list.items.filter((i: any) => i.checked).length;
  const pct = Math.round((checked / total) * 100);

  // Group unchecked by aisle, show first few
  const unchecked = list.items.filter((i: any) => !i.checked);
  const byAisle: Record<string, string[]> = {};
  for (const item of unchecked) {
    const aisle = item.aisle || 'Other';
    if (!byAisle[aisle]) byAisle[aisle] = [];
    byAisle[aisle].push(item.name);
  }

  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Shopping List</h2>
        <Link href="/shopping" className="text-xs text-brand-500 hover:underline">View all →</Link>
      </div>

      {/* Progress bar */}
      <div className="mb-3">
        <div className="flex justify-between text-xs text-gray-500 mb-1">
          <span>{checked} of {total} items checked</span>
          <span className={pct === 100 ? 'text-green-600 font-semibold' : ''}>{pct}%</span>
        </div>
        <div className="w-full bg-gray-100 rounded-full h-2">
          <div
            className={`h-2 rounded-full transition-all ${pct === 100 ? 'bg-green-500' : 'bg-brand-500'}`}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {/* Remaining items by aisle */}
      {unchecked.length > 0 ? (
        <div className="space-y-2">
          {Object.entries(byAisle).slice(0, 3).map(([aisle, items]) => (
            <div key={aisle}>
              <div className="text-[10px] font-semibold text-gray-400 uppercase tracking-wide mb-0.5">{aisle}</div>
              <div className="flex flex-wrap gap-1">
                {items.slice(0, 4).map((name, i) => (
                  <span key={i} className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">{name}</span>
                ))}
                {items.length > 4 && (
                  <span className="text-xs text-gray-400 px-1 py-0.5">+{items.length - 4} more</span>
                )}
              </div>
            </div>
          ))}
          {Object.keys(byAisle).length > 3 && (
            <p className="text-xs text-gray-400">+ {Object.keys(byAisle).length - 3} more aisles</p>
          )}
        </div>
      ) : (
        <p className="text-sm text-green-600 font-medium flex items-center gap-1.5">
          <span>✅</span> All items checked — you're ready to cook!
        </p>
      )}
    </div>
  );
}

// ── Quick Actions ─────────────────────────────────────────────────────────────

function QuickActions() {
  return (
    <div className="grid grid-cols-4 gap-2">
      {[
        { href: '/planner', icon: '📅', label: 'Planner' },
        { href: '/swipe', icon: '🔥', label: 'Swipe' },
        { href: '/shopping', icon: '🛒', label: 'Shopping' },
        { href: '/recipes', icon: '📖', label: 'Recipes' },
      ].map(({ href, icon, label }) => (
        <Link
          key={href}
          href={href}
          className="card p-3 text-center hover:shadow-md transition-shadow"
        >
          <div className="text-2xl mb-1">{icon}</div>
          <div className="text-xs font-medium text-gray-600">{label}</div>
        </Link>
      ))}
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────

export default function DashboardPage() {
  const [thisWeek, setThisWeek] = useState<any>(null);
  const [nextWeek, setNextWeek] = useState<any>(null);
  const [shoppingList, setShoppingList] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const todayStr = format(now, 'yyyy-MM-dd');

  useEffect(() => {
    Promise.all([
      getWeekPlan(weekStart(0)).catch(() => null),
      getWeekPlan(weekStart(1)).catch(() => null),
      getCurrentShoppingList().catch(() => null),
    ]).then(([tw, nw, sl]) => {
      setThisWeek(tw);
      setNextWeek(nw);
      setShoppingList(sl);
      setLoading(false);
    });
  }, []);

  // Find tonight's meal
  const todayDay = thisWeek?.days?.find((d: any) => d.date === todayStr);
  const tonightMeal = todayDay?.meals?.[0] ?? null;

  // For the "tonight" card, enrich with recipe details from the week plan
  // (recipe_image, recipe_cuisine, etc. come from the API already)

  const thisWeekLabel = thisWeek
    ? `This Week  ·  ${format(new Date(thisWeek.week_start + 'T12:00:00'), 'MMM d')}–${format(new Date(thisWeek.week_end + 'T12:00:00'), 'MMM d')}`
    : 'This Week';

  const nextWeekLabel = nextWeek
    ? `Next Week  ·  ${format(new Date(nextWeek.week_start + 'T12:00:00'), 'MMM d')}–${format(new Date(nextWeek.week_end + 'T12:00:00'), 'MMM d')}`
    : 'Next Week';

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">Kitchen</h1>
          <p className="text-sm text-gray-400">{format(now, 'EEEE, MMMM d')}</p>
        </div>
        <Link href="/planner" className="btn-secondary text-sm">
          📅 Planner
        </Link>
      </div>

      {/* Tonight */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Tonight</h2>
          {tonightMeal?.status === 'cooked' && (
            <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full font-medium">Cooked ✓</span>
          )}
        </div>
        <TonightCard meal={tonightMeal} loading={loading} />
      </div>

      {/* This week */}
      <WeekStrip weekPlan={thisWeek} label={thisWeekLabel} loading={loading} />

      {/* Next week */}
      <WeekStrip weekPlan={nextWeek} label={nextWeekLabel} loading={loading} />

      {/* Shopping */}
      <ShoppingWidget list={shoppingList} loading={loading} />

      {/* Quick actions */}
      <QuickActions />
    </div>
  );
}
