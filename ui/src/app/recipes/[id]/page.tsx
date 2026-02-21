'use client';

import { useState, useEffect, useContext } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getRecipe, deleteRecipe, createRating, getKrogerStatus, matchRecipeToKroger, addRecipeToKrogerCart, archiveRecipe, unarchiveRecipe, updateRecipe, uploadRecipePhoto } from '@/lib/api';
import { UserContext } from '@/lib/user-context';
import { useI18n } from '@/lib/i18n';

// Build schema.org Recipe JSON-LD for Instacart widget + SEO
function buildRecipeSchema(recipe: any): object {
  const schema: any = {
    '@context': 'https://schema.org',
    '@type': 'Recipe',
    name: recipe.title,
    recipeIngredient: recipe.ingredients?.map((ing: any) => ing.raw_text) || [],
  };
  if (recipe.description) schema.description = recipe.description;
  if (recipe.image_path || recipe.image_url) {
    schema.image = recipe.image_path
      ? `${window.location.origin}${recipe.image_path}`
      : recipe.image_url;
  }
  if (recipe.servings) schema.recipeYield = `${recipe.servings} servings`;
  if (recipe.prep_time_min) schema.prepTime = `PT${recipe.prep_time_min}M`;
  if (recipe.cook_time_min) schema.cookTime = `PT${recipe.cook_time_min}M`;
  if (recipe.total_time_min) schema.totalTime = `PT${recipe.total_time_min}M`;
  if (recipe.cuisine) schema.recipeCuseCategory = recipe.cuisine;
  if (recipe.steps?.length) {
    schema.recipeInstructions = recipe.steps.map((s: any) => ({
      '@type': 'HowToStep',
      text: s.instruction,
    }));
  }
  return schema;
}

export default function RecipeDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { currentUser } = useContext(UserContext);
  const { t } = useI18n();
  const [recipe, setRecipe] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [showRating, setShowRating] = useState(false);
  const [ratingStars, setRatingStars] = useState(5);
  const [wouldMakeAgain, setWouldMakeAgain] = useState(true);
  const [ratingNotes, setRatingNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [savingTitle, setSavingTitle] = useState(false);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [krogerStatus, setKrogerStatus] = useState<any>(null);
  const [krogerMatch, setKrogerMatch] = useState<any>(null);
  const [krogerLoading, setKrogerLoading] = useState(false);
  const [krogerCartResult, setKrogerCartResult] = useState<any>(null);
  const [showKrogerDetails, setShowKrogerDetails] = useState(false);

  useEffect(() => {
    if (params.id) {
      getRecipe(Number(params.id)).then(setRecipe).catch(() => null).finally(() => setLoading(false));
    }
  }, [params.id]);

  // Check Kroger connection status
  useEffect(() => {
    getKrogerStatus(currentUser?.id || 1).then(setKrogerStatus).catch(() => null);
  }, [currentUser]);

  const handleDelete = async () => {
    if (!confirm('Delete this recipe?')) return;
    await deleteRecipe(Number(params.id));
    router.push('/recipes');
  };

  const handleRate = async () => {
    if (!currentUser) return;
    setSubmitting(true);
    try {
      await createRating({
        recipe_id: Number(params.id),
        user_id: currentUser.id,
        stars: ratingStars,
        would_make_again: wouldMakeAgain,
        notes: ratingNotes,
      });
      // Reload recipe to show new rating
      const updated = await getRecipe(Number(params.id));
      setRecipe(updated);
      setShowRating(false);
      setRatingNotes('');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSaveTitle = async () => {
    const newTitle = editTitle.trim();
    if (!newTitle || newTitle === recipe.title) {
      setEditingTitle(false);
      return;
    }
    setSavingTitle(true);
    try {
      await updateRecipe(Number(params.id), { title: newTitle });
      setRecipe({ ...recipe, title: newTitle });
      setEditingTitle(false);
    } catch {
      alert('Failed to rename recipe.');
    }
    setSavingTitle(false);
  };

  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingPhoto(true);
    try {
      const result = await uploadRecipePhoto(Number(params.id), file);
      setRecipe({ ...recipe, image_path: result.image_path });
    } catch {
      alert('Failed to upload photo.');
    }
    setUploadingPhoto(false);
    e.target.value = '';  // Reset so same file can be re-selected
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Loading...</div>;
  if (!recipe) return <div className="text-center py-12 text-gray-400">Recipe not found</div>;

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      {/* Recipe JSON-LD for Instacart widget + SEO */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(buildRecipeSchema(recipe)) }}
      />

      {/* Header */}
      <div className="card overflow-hidden">
        {(recipe.image_url || recipe.image_path) ? (
          <div className="h-64 overflow-hidden relative group">
            <img src={recipe.image_path || recipe.image_url} alt={recipe.title} className="w-full h-full object-cover" />
            <label className="absolute bottom-3 right-3 bg-black/60 hover:bg-black/80 text-white text-xs px-3 py-1.5 rounded-lg cursor-pointer opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
              {uploadingPhoto ? 'Uploading...' : 'Replace Photo'}
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
            </label>
          </div>
        ) : (
          <label className="h-40 bg-gray-50 border-2 border-dashed border-gray-200 flex flex-col items-center justify-center cursor-pointer hover:bg-gray-100 transition-colors">
            <span className="text-3xl mb-1">{uploadingPhoto ? '...' : '📷'}</span>
            <span className="text-sm text-gray-400">{uploadingPhoto ? 'Uploading...' : 'Add a photo'}</span>
            <input type="file" accept="image/*" className="hidden" onChange={handlePhotoUpload} disabled={uploadingPhoto} />
          </label>
        )}
        <div className="p-6">
          {editingTitle ? (
            <div className="flex items-center gap-2 mb-2">
              <input
                className="input text-2xl font-bold flex-1"
                value={editTitle}
                onChange={(e) => setEditTitle(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleSaveTitle(); if (e.key === 'Escape') setEditingTitle(false); }}
                autoFocus
                disabled={savingTitle}
              />
              <button onClick={handleSaveTitle} disabled={savingTitle} className="btn-primary text-sm px-3 py-1">
                {savingTitle ? '...' : 'Save'}
              </button>
              <button onClick={() => setEditingTitle(false)} className="btn-secondary text-sm px-3 py-1">Cancel</button>
            </div>
          ) : (
            <h1
              className="text-3xl font-bold mb-2 cursor-pointer hover:text-brand-600 transition-colors"
              onClick={() => { setEditTitle(recipe.title); setEditingTitle(true); }}
              title="Click to rename"
            >
              {recipe.title}
            </h1>
          )}
          {recipe.description && <p className="text-gray-600 mb-3">{recipe.description}</p>}

          <div className="flex flex-wrap gap-3 text-sm text-gray-500 mb-3">
            {recipe.cuisine && <span className="badge bg-brand-100 text-brand-700">{recipe.cuisine}</span>}
            {recipe.prep_time_min && <span>🔪 Prep: {recipe.prep_time_min} min</span>}
            {recipe.cook_time_min && <span>🔥 Cook: {recipe.cook_time_min} min</span>}
            {recipe.total_time_min && <span>⏱ Total: {recipe.total_time_min} min</span>}
            <span>🍽 Serves {recipe.servings}</span>
            {recipe.difficulty && <span className="capitalize">📊 {recipe.difficulty}</span>}
          </div>

          {recipe.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {recipe.tags.map((t: any) => (
                <span key={t.id} className="badge bg-gray-100 text-gray-600">{t.name}</span>
              ))}
            </div>
          )}

          {recipe.source_url && (
            recipe.source_url.startsWith('photo:') ? (
              <span className="text-sm text-gray-500">
                📸 Imported from photo{recipe.source_url.replace('photo:', '') !== 'photo' ? `: ${recipe.source_url.replace('photo:', '')}` : ''}
              </span>
            ) : (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="text-sm text-brand-500 hover:underline">
                🔗 Original Recipe →
              </a>
            )
          )}
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-wrap gap-3">
        <Link href={`/cook/${recipe.id}`} className="btn-primary flex-1 text-center">
          👨‍🍳 Start Cooking
        </Link>
        <button onClick={() => setShowRating(!showRating)} className="btn-secondary">
          ⭐ Rate
        </button>
        {(recipe.original_text || recipe.source_url) && (
          <button
            onClick={() => setShowOriginal(!showOriginal)}
            className={`btn-secondary ${showOriginal ? 'ring-2 ring-brand-300' : ''}`}
          >
            {showOriginal ? '📋 Formatted' : '📄 Original'}
          </button>
        )}
        <button
          onClick={async () => {
            if (recipe.archived) {
              await unarchiveRecipe(recipe.id);
              setRecipe({ ...recipe, archived: false });
            } else {
              await archiveRecipe(recipe.id);
              setRecipe({ ...recipe, archived: true });
            }
          }}
          className={recipe.archived ? 'btn-secondary ring-2 ring-amber-300' : 'btn-secondary'}
          title={recipe.archived ? (t('recipe.unarchive', 'Unarchive')) : (t('recipe.archive', 'Archive'))}
        >
          {recipe.archived ? '📂' : '📦'}
        </button>
        <button onClick={handleDelete} className="btn-danger">🗑</button>
      </div>

      {/* Archived banner */}
      {recipe.archived && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-amber-800 text-sm flex items-center gap-2">
          📦 {t('recipe.archived_msg', 'This recipe is archived and hidden from your main list.')}
          <button
            onClick={async () => { await unarchiveRecipe(recipe.id); setRecipe({ ...recipe, archived: false }); }}
            className="ml-auto text-amber-600 hover:text-amber-800 font-medium"
          >
            {t('recipe.unarchive', 'Unarchive')}
          </button>
        </div>
      )}

      {/* 🛒 Kroger One-Click Cart */}
      {recipe.ingredients?.length > 0 && (
        <div className="card p-5 bg-blue-50 border-blue-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-blue-800">🛒 {t('kroger.title')}</h3>
            {krogerStatus?.connected && (
              <span className="text-xs text-green-600 bg-green-100 px-2 py-0.5 rounded-full">
                ✓ {krogerStatus.first_name || krogerStatus.email || t('kroger.connected')}
              </span>
            )}
          </div>

          {/* Not connected — show connect button */}
          {krogerStatus && !krogerStatus.connected && (
            <div className="text-center py-3">
              <p className="text-sm text-gray-600 mb-3">{t('kroger.connect_desc')}</p>
              <a
                href={`/api/kroger/connect?user_id=${currentUser?.id || 1}`}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
              >
                {t('kroger.connect_btn')}
              </a>
            </div>
          )}

          {/* Connected — show one-click add to cart */}
          {krogerStatus?.connected && !krogerCartResult && (
            <div>
              {/* Preview matches if loaded */}
              {krogerMatch && showKrogerDetails && (
                <div className="mb-3 space-y-1.5 max-h-64 overflow-y-auto">
                  {krogerMatch.items.map((item: any, idx: number) => (
                    <div key={idx} className={`flex items-center justify-between px-3 py-1.5 rounded-lg text-sm ${item.matched ? 'bg-white border border-blue-200' : 'bg-red-50 border border-red-200'}`}>
                      <div className="flex items-center gap-2 min-w-0">
                        <span>{item.matched ? '✅' : '❌'}</span>
                        <span className="truncate text-gray-700">{item.ingredient}</span>
                      </div>
                      {item.matched && (
                        <div className="flex items-center gap-2 ml-2 shrink-0">
                          <span className="text-xs text-gray-500">{item.size}</span>
                          <span className="text-xs font-medium">${item.price?.toFixed(2) || '?'}</span>
                          {item.on_sale && <span className="text-xs text-red-500">SALE</span>}
                        </div>
                      )}
                    </div>
                  ))}
                  <div className="text-right text-sm font-medium text-blue-800 pt-1">
                    Est. total: ${krogerMatch.estimated_cost?.toFixed(2)}
                  </div>
                </div>
              )}

              <div className="flex gap-2">
                <button
                  onClick={async () => {
                    setKrogerLoading(true);
                    try {
                      // Match + add to cart in one shot
                      const result = await addRecipeToKrogerCart(recipe.id, currentUser?.id || 1);
                      setKrogerCartResult(result);
                    } catch (e: any) {
                      if (e.message?.includes('401')) {
                        // Token expired, need to reconnect
                        setKrogerStatus({ connected: false });
                      } else {
                        alert(e.message || 'Failed to add to cart');
                      }
                    } finally {
                      setKrogerLoading(false);
                    }
                  }}
                  disabled={krogerLoading}
                  className="flex-1 inline-flex items-center justify-center gap-2 px-5 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium disabled:opacity-50 disabled:cursor-not-allowed text-lg"
                >
                  {krogerLoading ? (
                    <>{t('kroger.adding')}</>
                  ) : (
                    <>{t('kroger.add_all')}</>
                  )}
                </button>
                <button
                  onClick={async () => {
                    if (!krogerMatch) {
                      setKrogerLoading(true);
                      try {
                        const match = await matchRecipeToKroger(recipe.id);
                        setKrogerMatch(match);
                        setShowKrogerDetails(true);
                      } catch (e) {}
                      setKrogerLoading(false);
                    } else {
                      setShowKrogerDetails(!showKrogerDetails);
                    }
                  }}
                  className="px-3 py-3 bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 transition-colors text-sm"
                  title="Preview ingredient matches"
                >
                  {showKrogerDetails ? '▲' : '▼'}
                </button>
              </div>
              <p className="text-xs text-blue-600 mt-2">
                {t('kroger.auto_match')}
              </p>
            </div>
          )}

          {/* Success state — show matched products with links */}
          {krogerCartResult && (
            <div className="py-2">
              <div className="flex items-center justify-between mb-3">
                <p className="font-medium text-blue-800">
                  {krogerCartResult.added} {t('kroger.items')} · ~${krogerCartResult.estimated_cost?.toFixed(2)}
                </p>
                <a
                  href="https://www.kroger.com/cart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-xs font-medium"
                >
                  {t('kroger.open_cart_short')}
                </a>
              </div>

              {/* Product list with direct Kroger links */}
              <div className="space-y-1.5 max-h-72 overflow-y-auto mb-3">
                {krogerCartResult.items?.map((item: any, idx: number) => (
                  <a
                    key={idx}
                    href={item.matched ? (item.product_url || item.search_url) : undefined}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center justify-between px-3 py-2 rounded-lg text-sm transition-colors ${
                      item.matched 
                        ? 'bg-white border border-blue-200 hover:bg-blue-50 cursor-pointer' 
                        : 'bg-red-50 border border-red-200'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <span>{item.matched ? '✅' : '❌'}</span>
                      <div className="min-w-0">
                        <div className="text-gray-500 text-xs truncate">{item.ingredient}</div>
                        {item.matched && (
                          <div className="text-gray-800 text-sm truncate">{item.description}</div>
                        )}
                      </div>
                    </div>
                    {item.matched && (
                      <div className="flex items-center gap-2 ml-2 shrink-0">
                        <span className="text-xs text-gray-500">{item.size}</span>
                        <span className="text-sm font-medium">${item.price?.toFixed(2)}</span>
                        {item.on_sale && <span className="text-xs text-red-500 font-medium">SALE</span>}
                      </div>
                    )}
                  </a>
                ))}
              </div>

              {krogerCartResult.skipped?.length > 0 && (
                <p className="text-xs text-amber-600 mb-2">
                  ⚠️ Not found: {krogerCartResult.skipped.join(', ')}
                </p>
              )}

              <div className="flex gap-2">
                <a
                  href="https://www.kroger.com/cart"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex-1 inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors font-medium"
                >
                  {t('kroger.open_cart')}
                </a>
                <button
                  onClick={() => setKrogerCartResult(null)}
                  className="px-4 py-2.5 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition-colors text-sm"
                >
                  ✕
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-2 text-center">
                {t('kroger.tap_item')}
              </p>
            </div>
          )}
        </div>
      )}

      {/* 🥑 Whole Foods / Amazon Fresh */}
      {recipe.ingredients?.length > 0 && (() => {
        const ingredients = recipe.ingredients
          .map((i: any) => i.ingredient_name || '')
          .filter((n: string) => n && n.length > 1);

        if (ingredients.length === 0) return null;

        const ASSOCIATE_TAG = 'trevordukeco-20';

        return (
          <div className="card p-5 bg-green-50 border-green-200">
            <h3 className="font-semibold text-green-800 mb-3">
              🥑 {t('wholefoods.title', 'Whole Foods')}
            </h3>
            <div className="space-y-1.5 mb-3 max-h-64 overflow-y-auto">
              {ingredients.map((name: string, idx: number) => (
                <a
                  key={idx}
                  href={`https://www.amazon.com/s?k=${encodeURIComponent(name)}&i=wholefoods&tag=${ASSOCIATE_TAG}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 px-3 py-2 bg-white rounded-lg border border-green-200 hover:bg-green-100 transition-colors text-sm"
                >
                  <span className="text-green-500">🔍</span>
                  <span className="text-gray-700">{name}</span>
                  <span className="ml-auto text-green-400 text-xs">→</span>
                </a>
              ))}
            </div>
            <a
              href={`https://www.amazon.com/s?k=${encodeURIComponent(ingredients.slice(0, 3).join(' '))}&i=wholefoods&tag=${ASSOCIATE_TAG}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
            >
              🥑 {t('wholefoods.open', 'Open Whole Foods')}
            </a>
            <p className="text-xs text-green-600 mt-2">
              {t('wholefoods.desc', 'Search each ingredient on Amazon Whole Foods for delivery')}
            </p>
          </div>
        );
      })()}

      {/* Original Recipe View */}
      {showOriginal && (
        <div className="card p-5 bg-amber-50 border-amber-200">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-amber-800">📄 Original Recipe</h3>
            {recipe.source_url && !recipe.source_url.startsWith('photo:') && (
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer"
                className="text-sm text-brand-500 hover:underline">
                Open source ↗
              </a>
            )}
          </div>
          {recipe.source_url?.startsWith('photo:') && recipe.image_path && (
            <div className="mb-4">
              <p className="text-sm text-amber-700 mb-2">📸 Imported from this photo:</p>
              <img src={recipe.image_path} alt="Original recipe photo" className="rounded-lg max-h-96 w-full object-contain bg-white" />
            </div>
          )}
          {recipe.original_text ? (
            <pre className="whitespace-pre-wrap text-sm text-amber-900 font-mono leading-relaxed bg-white/50 rounded-lg p-4 max-h-[600px] overflow-y-auto">
              {recipe.original_text}
            </pre>
          ) : recipe.source_url && !recipe.source_url.startsWith('photo:') ? (
            <p className="text-sm text-amber-700">
              Full original at:{' '}
              <a href={recipe.source_url} target="_blank" rel="noopener noreferrer" className="underline">
                {recipe.source_url}
              </a>
            </p>
          ) : (
            <p className="text-sm text-amber-700">No original text stored for this recipe.</p>
          )}
        </div>
      )}

      {/* Rating Form */}
      {showRating && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Rate this recipe ({currentUser?.name})</h3>

          <div className="star-rating flex gap-1 text-3xl mb-4">
            {[1, 2, 3, 4, 5].map((s) => (
              <button
                key={s}
                onClick={() => setRatingStars(s)}
                className={`star ${s <= ratingStars ? 'active text-brand-500' : 'text-gray-300'}`}
              >
                ★
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 mb-3">
            <input
              type="checkbox"
              checked={wouldMakeAgain}
              onChange={(e) => setWouldMakeAgain(e.target.checked)}
              className="rounded"
            />
            <span>Would make again</span>
          </label>

          <textarea
            className="input mb-3"
            placeholder="Notes (optional) — e.g., 'Added extra garlic, Emily loved it'"
            value={ratingNotes}
            onChange={(e) => setRatingNotes(e.target.value)}
            rows={2}
          />

          <button onClick={handleRate} disabled={submitting} className="btn-primary w-full">
            {submitting ? 'Saving...' : 'Submit Rating'}
          </button>
        </div>
      )}

      {/* Ratings */}
      {recipe.ratings?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Ratings</h3>
          <div className="space-y-3">
            {recipe.ratings.map((r: any) => (
              <div key={r.id} className="flex items-start gap-3 p-3 bg-gray-50 rounded-lg">
                <div className="text-2xl">
                  {r.user_name === 'Trevor' ? '👨‍🍳' : '👩‍🍳'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{r.user_name}</span>
                    <span className="text-yellow-500">{'★'.repeat(r.stars)}{'☆'.repeat(5 - r.stars)}</span>
                    {r.would_make_again && <span className="badge bg-green-100 text-green-700">Would make again ✓</span>}
                  </div>
                  {r.notes && <p className="text-sm text-gray-600 mt-1">{r.notes}</p>}
                  {r.cooked_at && <p className="text-xs text-gray-400 mt-1">Cooked {r.cooked_at}</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Ingredients */}
      {!showOriginal && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">Ingredients</h3>
          <ul className="space-y-2">
            {recipe.ingredients?.map((ing: any, i: number) => (
              <li key={i} className="flex items-start gap-2">
                <span className="text-brand-400 mt-1">•</span>
                <span>{ing.raw_text}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Steps */}
      {!showOriginal && (
        <div className="card p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold">Steps</h3>
            <Link href={`/cook/${recipe.id}`} className="text-sm text-brand-500">Cook-along mode →</Link>
          </div>
          <ol className="space-y-4">
            {recipe.steps?.map((step: any) => (
              <li key={step.id} className="flex gap-3">
                <span className="flex-shrink-0 w-7 h-7 rounded-full bg-brand-500 text-white text-sm flex items-center justify-center font-medium">
                  {step.step_number}
                </span>
                <div className="flex-1">
                  <p>{step.instruction}</p>
                  {step.duration_minutes && (
                    <span className="inline-flex items-center gap-1 mt-1 text-sm text-brand-600 bg-brand-50 px-2 py-0.5 rounded">
                      ⏱ {step.duration_minutes} min {step.timer_label && `— ${step.timer_label}`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </div>
      )}

      {/* Notes / Tips */}
      {recipe.notes && !showOriginal && (
        <div className="card p-5 bg-blue-50 border-blue-100">
          <h3 className="font-semibold text-blue-800 mb-2">💡 Tips & Notes</h3>
          <div className="text-sm text-blue-900 whitespace-pre-wrap leading-relaxed">{recipe.notes}</div>
        </div>
      )}
    </div>
  );
}
