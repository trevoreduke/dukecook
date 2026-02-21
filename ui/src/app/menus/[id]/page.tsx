'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { getGuestMenu, updateGuestMenu, deleteGuestMenu, regenerateTheme, getMenuResults, getRecipes } from '@/lib/api';

export default function MenuDetailPage() {
  const params = useParams();
  const router = useRouter();
  const menuId = Number(params.id);

  const [menu, setMenu] = useState<any>(null);
  const [results, setResults] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [error, setError] = useState('');

  // Edit fields
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [active, setActive] = useState(true);
  const [themePrompt, setThemePrompt] = useState('');
  const [tagline, setTagline] = useState('');
  const [subtexts, setSubtexts] = useState<Record<number, string>>({});

  // Recipe sections editing
  const [sections, setSections] = useState<{ title: string; recipeIds: number[] }[]>([]);
  const [sectionsChanged, setSectionsChanged] = useState(false);
  const [showRecipePicker, setShowRecipePicker] = useState(false);
  const [addToSectionIdx, setAddToSectionIdx] = useState<number | null>(null);
  const [allRecipes, setAllRecipes] = useState<any[]>([]);
  const [recipeSearch, setRecipeSearch] = useState('');
  const [loadingRecipes, setLoadingRecipes] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const [menuData, resultsData] = await Promise.all([
        getGuestMenu(menuId),
        getMenuResults(menuId),
      ]);
      setMenu(menuData);
      setResults(resultsData);
      setTitle(menuData.title);
      setSlug(menuData.slug);
      setActive(menuData.active);
      setThemePrompt(menuData.theme_prompt || '');
      setTagline(menuData.theme?.tagline || '');
      const st: Record<number, string> = {};
      for (const item of menuData.items || []) {
        if (item.subtext) st[item.recipe_id] = item.subtext;
      }
      setSubtexts(st);

      // Build sections from theme, mapping recipe titles → IDs
      const items = menuData.items || [];
      const titleToId: Record<string, number> = {};
      for (const item of items) titleToId[item.title] = item.recipe_id;

      const themeSections = menuData.theme?.sections || [];
      const builtSections: { title: string; recipeIds: number[] }[] = [];
      const assignedIds = new Set<number>();

      for (const sec of themeSections) {
        const ids: number[] = [];
        for (const t of sec.items || []) {
          const id = titleToId[t];
          if (id != null && !assignedIds.has(id)) {
            ids.push(id);
            assignedIds.add(id);
          }
        }
        if (ids.length > 0) {
          builtSections.push({ title: sec.title, recipeIds: ids });
        }
      }
      // Any unassigned recipes go to an "Other" section
      const unassigned = items
        .filter((item: any) => !assignedIds.has(item.recipe_id))
        .map((item: any) => item.recipe_id);
      if (unassigned.length > 0) {
        builtSections.push({ title: 'OTHER', recipeIds: unassigned });
      }
      // If no sections at all, put everything in one section
      if (builtSections.length === 0 && items.length > 0) {
        builtSections.push({ title: 'MENU', recipeIds: items.map((item: any) => item.recipe_id) });
      }

      setSections(builtSections);
      setSectionsChanged(false);
    } catch {
      setError('Failed to load menu');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, [menuId]);

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      const update: any = { title, slug, active };
      // Include tagline if it changed
      if (tagline !== (menu.theme?.tagline || '')) {
        update.theme = { tagline };
      }
      // Include subtexts if any are set
      const hasSubtexts = Object.values(subtexts).some(v => v.trim());
      if (hasSubtexts || Object.keys(subtexts).length > 0) {
        update.subtexts = subtexts;
      }
      // Include recipe_ids and updated sections if changed
      if (sectionsChanged) {
        update.recipe_ids = sections.flatMap(s => s.recipeIds);
        // Build title lookup from menu items + allRecipes for newly added ones
        const idToTitle: Record<number, string> = {};
        for (const item of menu.items || []) idToTitle[item.recipe_id] = item.title;
        for (const r of allRecipes) idToTitle[r.id] = r.title;
        const themeSections = sections.map(s => ({
          title: s.title,
          items: s.recipeIds.map(id => idToTitle[id] || `Recipe #${id}`),
        }));
        update.theme = { ...(update.theme || {}), sections: themeSections };
      }
      await updateGuestMenu(menuId, update);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to save');
    }
    setSaving(false);
  };

  const handleRegenerate = async () => {
    setRegenerating(true);
    setError('');
    try {
      await regenerateTheme(menuId, themePrompt || undefined);
      await loadData();
    } catch (e: any) {
      setError(e.message || 'Failed to regenerate theme');
    }
    setRegenerating(false);
  };

  const handleDelete = async () => {
    if (!confirm(`Delete "${menu?.title}"? This cannot be undone and removes all votes.`)) return;
    await deleteGuestMenu(menuId);
    router.push('/menus');
  };

  const copyLink = () => {
    const url = `${window.location.origin}/m/${slug}`;
    navigator.clipboard.writeText(url);
    alert('Link copied!');
  };

  if (loading) return <div className="text-center py-8 text-gray-400">Loading...</div>;
  if (!menu) return <div className="text-center py-8 text-red-500">Menu not found</div>;

  const maxVotes = results ? Math.max(...results.tally.map((t: any) => t.vote_count), 1) : 1;

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/menus" className="text-gray-400 hover:text-gray-600">← Back</Link>
        <h1 className="text-2xl font-bold">{menu.title}</h1>
        <span className={`badge text-xs ${active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
          {active ? 'Active' : 'Inactive'}
        </span>
      </div>

      {error && <div className="bg-red-50 text-red-700 px-4 py-2 rounded-lg text-sm">{error}</div>}

      {/* Quick actions */}
      <div className="flex flex-wrap gap-2">
        <a href={`/m/${menu.slug}`} target="_blank" className="px-4 py-2 bg-brand-50 text-brand-600 rounded-lg hover:bg-brand-100 text-sm font-medium">
          Open Guest Page ↗
        </a>
        <button onClick={copyLink} className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 text-sm font-medium">
          Copy Link
        </button>
      </div>

      {/* Vote Results */}
      {results && results.tally.length > 0 && (
        <div className="card p-4">
          <h2 className="font-semibold text-lg mb-1">Vote Results</h2>
          <p className="text-sm text-gray-500 mb-4">{results.total_guests} guest{results.total_guests !== 1 ? 's' : ''} voted</p>

          <div className="space-y-3">
            {results.tally.map((item: any) => (
              <div key={item.recipe_id}>
                <div className="flex items-center justify-between mb-1">
                  <span className="font-medium text-sm">{item.recipe_title}</span>
                  <span className="text-sm text-gray-500">{item.vote_count} vote{item.vote_count !== 1 ? 's' : ''}</span>
                </div>
                <div className="h-6 bg-gray-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-brand-400 rounded-full transition-all"
                    style={{ width: `${(item.vote_count / maxVotes) * 100}%` }}
                  />
                </div>
                {(item.voter_details?.length > 0 ? item.voter_details : item.voters?.map((v: string) => ({ guest_name: v, comment: '' }))).length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {(item.voter_details?.length > 0 ? item.voter_details : item.voters?.map((v: string) => ({ guest_name: v, comment: '' }))).map((vd: any) => (
                      <span
                        key={vd.guest_name}
                        className="text-xs bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full"
                        title={vd.comment || undefined}
                      >
                        {vd.guest_name}{vd.comment ? `: ${vd.comment.length > 30 ? vd.comment.slice(0, 30) + '…' : vd.comment}` : ''}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Edit Section */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-lg">Edit Menu</h2>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-1">Title</label>
            <input className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Slug</label>
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-400">/m/</span>
              <input className="input flex-1" value={slug} onChange={(e) => setSlug(e.target.value)} />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={active}
              onChange={(e) => setActive(e.target.checked)}
              className="w-4 h-4 rounded"
            />
            <span className="text-sm">Active (guests can access and vote)</span>
          </label>
        </div>

        <div className="flex gap-2">
          <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
          <button onClick={handleDelete} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg hover:bg-red-100 text-sm">
            Delete Menu
          </button>
        </div>
      </div>

      {/* Theme Section */}
      <div className="card p-4 space-y-4">
        <h2 className="font-semibold text-lg">Theme</h2>

        {menu.theme && (
          <div className="bg-gray-50 rounded-lg p-3 space-y-2">
            <div>
              <label className="block text-xs font-medium text-gray-500 mb-1">Tagline</label>
              <div className="flex items-center gap-2">
                {menu.theme.decorative_emoji && <span className="text-lg">{menu.theme.decorative_emoji}</span>}
                <input
                  className="input flex-1 text-sm"
                  value={tagline}
                  onChange={(e) => setTagline(e.target.value)}
                  placeholder="Menu tagline..."
                />
              </div>
            </div>
            {menu.theme.description && (
              <div className="text-sm text-gray-600">{menu.theme.description}</div>
            )}
            <div className="flex gap-2 text-sm text-gray-400">
              <span>Fonts: {menu.theme.heading_font} + {menu.theme.body_font}</span>
            </div>
          </div>
        )}

        <div>
          <label className="block text-sm font-medium mb-1">Theme Prompt</label>
          <textarea
            className="input min-h-[60px]"
            placeholder="Describe the vibe..."
            value={themePrompt}
            onChange={(e) => setThemePrompt(e.target.value)}
          />
        </div>

        <button
          onClick={handleRegenerate}
          disabled={regenerating}
          className="px-4 py-2 bg-purple-50 text-purple-600 rounded-lg hover:bg-purple-100 text-sm font-medium disabled:opacity-50"
        >
          {regenerating ? (
            <span className="flex items-center gap-2">
              <span className="animate-spin">⟳</span> Regenerating theme...
            </span>
          ) : (
            'Regenerate Theme'
          )}
        </button>
      </div>

      {/* Recipes — grouped by sections */}
      <div className="card p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-lg">
            Recipes ({sections.reduce((n, s) => n + s.recipeIds.length, 0)})
          </h2>
          {sectionsChanged && (
            <span className="text-xs text-amber-600 bg-amber-50 px-2 py-1 rounded-full">
              Unsaved changes — hit Save
            </span>
          )}
        </div>

        <div className="space-y-4">
          {sections.map((section, si) => {
            const allMenuIds = sections.flatMap(s => s.recipeIds);

            return (
              <div key={si} className="border border-gray-200 rounded-lg overflow-hidden">
                {/* Section header */}
                <div className="flex items-center gap-2 bg-gray-50 px-3 py-2">
                  <input
                    className="flex-1 text-sm font-semibold uppercase tracking-wide bg-transparent border-0 border-b border-transparent focus:border-brand-400 outline-none px-0 py-0.5"
                    value={section.title}
                    onChange={(e) => {
                      const updated = [...sections];
                      updated[si] = { ...updated[si], title: e.target.value };
                      setSections(updated);
                      setSectionsChanged(true);
                    }}
                  />
                  <div className="flex items-center gap-1">
                    {si > 0 && (
                      <button
                        onClick={() => {
                          const updated = [...sections];
                          [updated[si - 1], updated[si]] = [updated[si], updated[si - 1]];
                          setSections(updated);
                          setSectionsChanged(true);
                        }}
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded text-xs"
                        title="Move section up"
                      >↑</button>
                    )}
                    {si < sections.length - 1 && (
                      <button
                        onClick={() => {
                          const updated = [...sections];
                          [updated[si], updated[si + 1]] = [updated[si + 1], updated[si]];
                          setSections(updated);
                          setSectionsChanged(true);
                        }}
                        className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 rounded text-xs"
                        title="Move section down"
                      >↓</button>
                    )}
                    {sections.length > 1 && (
                      <button
                        onClick={() => {
                          if (section.recipeIds.length > 0) {
                            // Move recipes to the first other section
                            const targetIdx = si === 0 ? 1 : 0;
                            const updated = [...sections];
                            updated[targetIdx] = {
                              ...updated[targetIdx],
                              recipeIds: [...updated[targetIdx].recipeIds, ...section.recipeIds],
                            };
                            updated.splice(si, 1);
                            setSections(updated);
                          } else {
                            setSections(s => s.filter((_, i) => i !== si));
                          }
                          setSectionsChanged(true);
                        }}
                        className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 rounded text-xs"
                        title="Remove section"
                      >✕</button>
                    )}
                  </div>
                </div>

                {/* Recipes in this section */}
                <div className="divide-y divide-gray-100">
                  {section.recipeIds.map((recipeId, ri) => {
                    const item = menu.items?.find((it: any) => it.recipe_id === recipeId);
                    const recipe = item || allRecipes.find((r: any) => r.id === recipeId);
                    const recipeTitle = item?.title || recipe?.title || `Recipe #${recipeId}`;
                    const imagePath = item?.image_path || item?.image_url || recipe?.image_path || recipe?.image_url;
                    const cuisine = item?.cuisine || recipe?.cuisine;
                    const difficulty = item?.difficulty || recipe?.difficulty;

                    return (
                      <div key={recipeId} className="px-3 py-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded bg-brand-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                            {imagePath ? (
                              <img src={imagePath} alt="" className="w-full h-full object-cover" />
                            ) : (
                              <span>🍽️</span>
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm truncate">{recipeTitle}</div>
                            <div className="text-xs text-gray-400">
                              {cuisine && <span>{cuisine}</span>}
                              {difficulty && <span> · {difficulty}</span>}
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            {/* Move within section */}
                            {ri > 0 && (
                              <button
                                onClick={() => {
                                  const updated = [...sections];
                                  const ids = [...updated[si].recipeIds];
                                  [ids[ri - 1], ids[ri]] = [ids[ri], ids[ri - 1]];
                                  updated[si] = { ...updated[si], recipeIds: ids };
                                  setSections(updated);
                                  setSectionsChanged(true);
                                }}
                                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded text-xs"
                                title="Move up"
                              >↑</button>
                            )}
                            {ri < section.recipeIds.length - 1 && (
                              <button
                                onClick={() => {
                                  const updated = [...sections];
                                  const ids = [...updated[si].recipeIds];
                                  [ids[ri], ids[ri + 1]] = [ids[ri + 1], ids[ri]];
                                  updated[si] = { ...updated[si], recipeIds: ids };
                                  setSections(updated);
                                  setSectionsChanged(true);
                                }}
                                className="w-6 h-6 flex items-center justify-center text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded text-xs"
                                title="Move down"
                              >↓</button>
                            )}
                            {/* Move to different section */}
                            {sections.length > 1 && (
                              <select
                                value={si}
                                onChange={(e) => {
                                  const targetSi = Number(e.target.value);
                                  if (targetSi === si) return;
                                  const updated = [...sections];
                                  // Remove from current section
                                  updated[si] = {
                                    ...updated[si],
                                    recipeIds: updated[si].recipeIds.filter(id => id !== recipeId),
                                  };
                                  // Add to target section
                                  updated[targetSi] = {
                                    ...updated[targetSi],
                                    recipeIds: [...updated[targetSi].recipeIds, recipeId],
                                  };
                                  setSections(updated);
                                  setSectionsChanged(true);
                                }}
                                className="text-xs bg-gray-100 border-0 rounded px-1 py-0.5 text-gray-500 cursor-pointer"
                                title="Move to section"
                              >
                                {sections.map((s, idx) => (
                                  <option key={idx} value={idx}>{s.title}</option>
                                ))}
                              </select>
                            )}
                            <button
                              onClick={() => {
                                const updated = [...sections];
                                updated[si] = {
                                  ...updated[si],
                                  recipeIds: updated[si].recipeIds.filter(id => id !== recipeId),
                                };
                                // Remove empty sections (unless it's the last one)
                                const filtered = updated.filter((s, i) => s.recipeIds.length > 0 || updated.length === 1);
                                setSections(filtered.length > 0 ? filtered : updated);
                                setSectionsChanged(true);
                              }}
                              className="w-6 h-6 flex items-center justify-center text-red-400 hover:text-red-600 hover:bg-red-50 rounded text-xs"
                              title="Remove from menu"
                            >✕</button>
                          </div>
                        </div>
                        <div className="mt-1 ml-13 pl-0" style={{ marginLeft: '52px' }}>
                          <input
                            className="w-full text-xs border-0 border-b border-gray-200 bg-transparent py-1 px-0 text-gray-600 placeholder-gray-300 focus:border-brand-400 focus:ring-0 outline-none"
                            placeholder="Add subtext (e.g. 'homemade dough, wood-fired')..."
                            value={subtexts[recipeId] || ''}
                            onChange={(e) => setSubtexts(prev => ({ ...prev, [recipeId]: e.target.value }))}
                          />
                        </div>
                      </div>
                    );
                  })}

                  {section.recipeIds.length === 0 && (
                    <div className="px-3 py-4 text-center text-sm text-gray-400">
                      No recipes in this section
                    </div>
                  )}
                </div>

                {/* Add recipe to this section */}
                <div className="border-t border-gray-100">
                  {addToSectionIdx === si && showRecipePicker ? (
                    <div className="p-3 space-y-2">
                      <div className="flex items-center gap-2">
                        <input
                          className="input flex-1 text-sm"
                          placeholder="Search recipes..."
                          value={recipeSearch}
                          onChange={(e) => setRecipeSearch(e.target.value)}
                          autoFocus
                        />
                        <button
                          onClick={() => { setShowRecipePicker(false); setRecipeSearch(''); setAddToSectionIdx(null); }}
                          className="text-sm text-gray-400 hover:text-gray-600 px-2"
                        >
                          Close
                        </button>
                      </div>
                      {loadingRecipes ? (
                        <div className="text-center text-sm text-gray-400 py-3">Loading recipes...</div>
                      ) : (
                        <div className="max-h-48 overflow-y-auto space-y-1">
                          {allRecipes
                            .filter(r =>
                              !allMenuIds.includes(r.id) &&
                              (!recipeSearch || r.title.toLowerCase().includes(recipeSearch.toLowerCase()))
                            )
                            .slice(0, 15)
                            .map(r => (
                              <button
                                key={r.id}
                                onClick={() => {
                                  const updated = [...sections];
                                  updated[si] = { ...updated[si], recipeIds: [...updated[si].recipeIds, r.id] };
                                  setSections(updated);
                                  setSectionsChanged(true);
                                }}
                                className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-brand-50 text-left transition-colors"
                              >
                                <div className="w-8 h-8 rounded bg-gray-100 flex-shrink-0 overflow-hidden flex items-center justify-center">
                                  {r.image_path || r.image_url ? (
                                    <img src={r.image_path || r.image_url} alt="" className="w-full h-full object-cover" />
                                  ) : (
                                    <span className="text-xs">🍽️</span>
                                  )}
                                </div>
                                <div className="flex-1 min-w-0">
                                  <div className="text-sm font-medium truncate">{r.title}</div>
                                  <div className="text-xs text-gray-400">
                                    {r.cuisine && <span>{r.cuisine}</span>}
                                    {r.proteins?.length > 0 && <span> · {r.proteins.join(', ')}</span>}
                                  </div>
                                </div>
                                <span className="text-brand-500 text-sm">+ Add</span>
                              </button>
                            ))}
                          {allRecipes.filter(r =>
                            !allMenuIds.includes(r.id) &&
                            (!recipeSearch || r.title.toLowerCase().includes(recipeSearch.toLowerCase()))
                          ).length === 0 && (
                            <div className="text-center text-sm text-gray-400 py-3">
                              {recipeSearch ? 'No matching recipes' : 'All recipes are on this menu'}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ) : (
                    <button
                      onClick={async () => {
                        setAddToSectionIdx(si);
                        setShowRecipePicker(true);
                        setRecipeSearch('');
                        if (allRecipes.length === 0) {
                          setLoadingRecipes(true);
                          try { setAllRecipes(await getRecipes()); } catch { /* ignore */ }
                          setLoadingRecipes(false);
                        }
                      }}
                      className="w-full py-2 text-xs text-gray-400 hover:text-brand-600 hover:bg-gray-50 transition-colors"
                    >
                      + Add recipe to {section.title}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Add new section */}
        <button
          onClick={() => {
            setSections(s => [...s, { title: 'NEW SECTION', recipeIds: [] }]);
            setSectionsChanged(true);
          }}
          className="mt-3 w-full py-2 border-2 border-dashed border-gray-300 rounded-lg text-sm text-gray-500 hover:border-brand-400 hover:text-brand-600 transition-colors"
        >
          + Add Section
        </button>
      </div>
    </div>
  );
}
