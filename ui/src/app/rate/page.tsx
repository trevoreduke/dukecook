'use client';

import { useState, useEffect, useContext, useCallback } from 'react';
import Link from 'next/link';
import { formatDistanceToNow, parseISO } from 'date-fns';
import { getPendingRatings, createRating } from '@/lib/api';
import { UserContext } from '@/lib/user-context';

interface PendingMeal {
  recipe_id: number;
  recipe_title: string;
  recipe_image: string;
  last_planned: string;
  cooked: boolean;
  total_time_min: number | null;
}

// One card = one un-rated meal, with its own self-contained rating state.
function RateCard({
  meal,
  userId,
  onRated,
}: {
  meal: PendingMeal;
  userId: number;
  onRated: (recipeId: number) => void;
}) {
  const [stars, setStars] = useState(5);
  const [wouldMakeAgain, setWouldMakeAgain] = useState(true);
  const [notes, setNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const planned = (() => {
    try {
      return formatDistanceToNow(parseISO(meal.last_planned), { addSuffix: true });
    } catch {
      return meal.last_planned;
    }
  })();

  const submit = async () => {
    setSubmitting(true);
    try {
      await createRating({
        recipe_id: meal.recipe_id,
        user_id: userId,
        stars,
        would_make_again: wouldMakeAgain,
        notes,
        // Rate it as of the night it was planned, so cooking stats line up.
        cooked_at: meal.last_planned,
      });
      onRated(meal.recipe_id);
    } catch (e) {
      console.error('Failed to save rating', e);
      alert('Could not save that rating — please try again.');
      setSubmitting(false);
    }
  };

  return (
    <div className="card p-4 flex flex-col sm:flex-row gap-4">
      <Link href={`/recipes/${meal.recipe_id}`} className="flex-shrink-0">
        {meal.recipe_image ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={meal.recipe_image}
            alt={meal.recipe_title}
            className="w-full sm:w-28 h-40 sm:h-28 object-cover rounded-xl"
          />
        ) : (
          <div className="w-full sm:w-28 h-40 sm:h-28 rounded-xl bg-brand-50 flex items-center justify-center text-4xl">
            🍽
          </div>
        )}
      </Link>

      <div className="flex-1 min-w-0">
        <Link
          href={`/recipes/${meal.recipe_id}`}
          className="font-semibold text-gray-800 hover:text-brand-600 line-clamp-2"
        >
          {meal.recipe_title}
        </Link>
        <div className="text-sm text-gray-400 mb-3">
          {meal.cooked ? '✅ Cooked' : '📅 Planned'} {planned}
          {meal.total_time_min ? ` · ⏱ ${meal.total_time_min} min` : ''}
        </div>

        <div className="star-rating flex gap-1 text-3xl mb-2">
          {[1, 2, 3, 4, 5].map((s) => (
            <button
              key={s}
              onClick={() => setStars(s)}
              aria-label={`${s} star${s > 1 ? 's' : ''}`}
              className={`star ${s <= stars ? 'active text-brand-500' : 'text-gray-300'}`}
            >
              ★
            </button>
          ))}
        </div>

        <label className="flex items-center gap-2 mb-2 text-sm">
          <input
            type="checkbox"
            checked={wouldMakeAgain}
            onChange={(e) => setWouldMakeAgain(e.target.checked)}
            className="rounded"
          />
          <span>Would make again 🔄</span>
        </label>

        <textarea
          className="input mb-3"
          placeholder="Notes (optional)"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={2}
        />

        <button onClick={submit} disabled={submitting} className="btn-primary w-full sm:w-auto">
          {submitting ? 'Saving…' : '⭐ Save rating'}
        </button>
      </div>
    </div>
  );
}

export default function RatePage() {
  const { currentUser } = useContext(UserContext);
  const [meals, setMeals] = useState<PendingMeal[]>([]);
  const [loading, setLoading] = useState(true);
  const [justRated, setJustRated] = useState(0);

  const load = useCallback(() => {
    if (!currentUser) return;
    setLoading(true);
    getPendingRatings(currentUser.id)
      .then((res) => setMeals(res.pending || []))
      .catch((e) => console.error('Failed to load pending ratings', e))
      .finally(() => setLoading(false));
  }, [currentUser]);

  useEffect(() => {
    load();
  }, [load]);

  const handleRated = (recipeId: number) => {
    setMeals((prev) => prev.filter((m) => m.recipe_id !== recipeId));
    setJustRated((n) => n + 1);
  };

  return (
    <div className="max-w-3xl mx-auto space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-brand-700">⭐ Rate Your Meals</h1>
          <p className="text-gray-500 text-sm">
            Meals from your calendar
            {currentUser ? `, ${currentUser.name},` : ''} that you haven&apos;t rated yet.
          </p>
        </div>
        {meals.length > 0 && (
          <span className="text-sm font-medium text-gray-400 whitespace-nowrap">
            {meals.length} to rate
          </span>
        )}
      </div>

      {loading ? (
        <div className="space-y-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="card p-4 h-44 animate-pulse bg-gray-50" />
          ))}
        </div>
      ) : meals.length === 0 ? (
        <div className="card p-10 text-center">
          <div className="text-5xl mb-3">🎉</div>
          <p className="font-semibold text-gray-700">
            {justRated > 0 ? 'All caught up!' : 'Nothing to rate right now.'}
          </p>
          <p className="text-gray-500 text-sm mb-5">
            {justRated > 0
              ? `You rated ${justRated} meal${justRated > 1 ? 's' : ''}. Nice work, Chef.`
              : 'Once meals on your planner pass, they’ll show up here for a quick rating.'}
          </p>
          <Link href="/planner" className="btn-secondary text-sm">
            📅 Go to Planner
          </Link>
        </div>
      ) : (
        <div className="space-y-4">
          {currentUser &&
            meals.map((m) => (
              <RateCard
                key={m.recipe_id}
                meal={m}
                userId={currentUser.id}
                onRated={handleRated}
              />
            ))}
        </div>
      )}
    </div>
  );
}
