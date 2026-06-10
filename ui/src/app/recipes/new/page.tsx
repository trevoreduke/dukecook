'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { createRecipe } from '@/lib/api';

type IngredientRow = { raw_text: string };
type StepRow = { instruction: string; duration_minutes: string };

export default function NewRecipePage() {
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [sourceUrl, setSourceUrl] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [prepTime, setPrepTime] = useState('');
  const [cookTime, setCookTime] = useState('');
  const [totalTime, setTotalTime] = useState('');
  const [servings, setServings] = useState('4');
  const [cuisine, setCuisine] = useState('');
  const [difficulty, setDifficulty] = useState('medium');
  const [tagsInput, setTagsInput] = useState('');

  const [ingredients, setIngredients] = useState<IngredientRow[]>([
    { raw_text: '' },
    { raw_text: '' },
    { raw_text: '' },
  ]);
  const [steps, setSteps] = useState<StepRow[]>([
    { instruction: '', duration_minutes: '' },
    { instruction: '', duration_minutes: '' },
  ]);

  const updateIngredient = (i: number, value: string) => {
    const next = [...ingredients];
    next[i] = { raw_text: value };
    setIngredients(next);
  };
  const addIngredient = () => setIngredients([...ingredients, { raw_text: '' }]);
  const removeIngredient = (i: number) => setIngredients(ingredients.filter((_, idx) => idx !== i));

  const updateStep = (i: number, patch: Partial<StepRow>) => {
    const next = [...steps];
    next[i] = { ...next[i], ...patch };
    setSteps(next);
  };
  const addStep = () => setSteps([...steps, { instruction: '', duration_minutes: '' }]);
  const removeStep = (i: number) => setSteps(steps.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    setError(null);
    if (!title.trim()) {
      setError('Title is required.');
      return;
    }

    const cleanedIngredients = ingredients
      .map((ing) => ing.raw_text.trim())
      .filter(Boolean)
      .map((raw_text) => ({ raw_text, name: raw_text }));

    const cleanedSteps = steps
      .filter((s) => s.instruction.trim())
      .map((s) => ({
        instruction: s.instruction.trim(),
        duration_minutes: s.duration_minutes ? parseInt(s.duration_minutes, 10) : null,
      }));

    const cleanedTags = tagsInput
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean);

    const payload: any = {
      title: title.trim(),
      description: description.trim(),
      source_url: sourceUrl.trim(),
      image_url: imageUrl.trim(),
      prep_time_min: prepTime ? parseInt(prepTime, 10) : null,
      cook_time_min: cookTime ? parseInt(cookTime, 10) : null,
      total_time_min: totalTime ? parseInt(totalTime, 10) : null,
      servings: servings ? parseInt(servings, 10) : 4,
      cuisine: cuisine.trim(),
      difficulty,
      ingredients: cleanedIngredients,
      steps: cleanedSteps,
      tags: cleanedTags,
    };

    setSaving(true);
    try {
      const recipe = await createRecipe(payload);
      router.push(`/recipes/${recipe.id}`);
    } catch (e: any) {
      setError(e.message || 'Failed to save recipe.');
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">✏️ New Recipe</h1>
        <Link href="/recipes" className="btn-secondary">Cancel</Link>
      </div>

      {error && (
        <div className="card p-4 bg-red-50 border border-red-200 text-red-700 text-sm">
          {error}
        </div>
      )}

      {/* Basics */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-lg">Basics</h2>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Title *</label>
          <input
            className="input w-full"
            placeholder="Grandma's Sunday Sauce"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
          <textarea
            className="input w-full"
            rows={3}
            placeholder="A short note about the recipe..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Source URL</label>
            <input
              className="input w-full"
              placeholder="https://..."
              value={sourceUrl}
              onChange={(e) => setSourceUrl(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Image URL</label>
            <input
              className="input w-full"
              placeholder="https://.../photo.jpg"
              value={imageUrl}
              onChange={(e) => setImageUrl(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Metadata */}
      <div className="card p-5 space-y-4">
        <h2 className="font-semibold text-lg">Details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Prep (min)</label>
            <input
              type="number"
              min="0"
              className="input w-full"
              value={prepTime}
              onChange={(e) => setPrepTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cook (min)</label>
            <input
              type="number"
              min="0"
              className="input w-full"
              value={cookTime}
              onChange={(e) => setCookTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Total (min)</label>
            <input
              type="number"
              min="0"
              className="input w-full"
              value={totalTime}
              onChange={(e) => setTotalTime(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Servings</label>
            <input
              type="number"
              min="1"
              className="input w-full"
              value={servings}
              onChange={(e) => setServings(e.target.value)}
            />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Cuisine</label>
            <input
              className="input w-full"
              placeholder="italian, mexican, thai..."
              value={cuisine}
              onChange={(e) => setCuisine(e.target.value)}
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Difficulty</label>
            <select
              className="input w-full"
              value={difficulty}
              onChange={(e) => setDifficulty(e.target.value)}
            >
              <option value="easy">Easy</option>
              <option value="medium">Medium</option>
              <option value="hard">Hard</option>
            </select>
          </div>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Tags <span className="text-gray-400 font-normal">(comma-separated)</span>
          </label>
          <input
            className="input w-full"
            placeholder="chicken, weeknight, one-pot"
            value={tagsInput}
            onChange={(e) => setTagsInput(e.target.value)}
          />
        </div>
      </div>

      {/* Ingredients */}
      <div className="card p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-lg">Ingredients</h2>
          <span className="text-xs text-gray-400">One per line. Example: &ldquo;2 cups flour&rdquo;</span>
        </div>
        {ingredients.map((ing, i) => (
          <div key={i} className="flex gap-2">
            <input
              className="input flex-1"
              placeholder={`Ingredient ${i + 1}`}
              value={ing.raw_text}
              onChange={(e) => updateIngredient(i, e.target.value)}
            />
            <button
              type="button"
              onClick={() => removeIngredient(i)}
              className="btn-secondary px-3"
              disabled={ingredients.length === 1}
              aria-label="Remove ingredient"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addIngredient} className="btn-secondary w-full">
          + Add Ingredient
        </button>
      </div>

      {/* Steps */}
      <div className="card p-5 space-y-3">
        <h2 className="font-semibold text-lg">Steps</h2>
        {steps.map((step, i) => (
          <div key={i} className="flex gap-2 items-start">
            <div className="flex-shrink-0 w-8 h-8 rounded-full bg-brand-100 text-brand-700 font-semibold flex items-center justify-center mt-1">
              {i + 1}
            </div>
            <div className="flex-1 space-y-2">
              <textarea
                className="input w-full"
                rows={2}
                placeholder={`Describe step ${i + 1}...`}
                value={step.instruction}
                onChange={(e) => updateStep(i, { instruction: e.target.value })}
              />
              <input
                type="number"
                min="0"
                className="input w-32"
                placeholder="Timer (min)"
                value={step.duration_minutes}
                onChange={(e) => updateStep(i, { duration_minutes: e.target.value })}
              />
            </div>
            <button
              type="button"
              onClick={() => removeStep(i)}
              className="btn-secondary px-3 mt-1"
              disabled={steps.length === 1}
              aria-label="Remove step"
            >
              ✕
            </button>
          </div>
        ))}
        <button type="button" onClick={addStep} className="btn-secondary w-full">
          + Add Step
        </button>
      </div>

      {/* Save */}
      <div className="flex gap-3 sticky bottom-4">
        <button
          onClick={handleSave}
          disabled={saving || !title.trim()}
          className="btn-primary flex-1 py-3 text-base shadow-lg"
        >
          {saving ? '⏳ Saving...' : '💾 Save Recipe'}
        </button>
        <Link href="/recipes" className="btn-secondary px-5 py-3 flex items-center">
          Cancel
        </Link>
      </div>
    </div>
  );
}
