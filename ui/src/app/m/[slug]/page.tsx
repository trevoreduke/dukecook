'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams } from 'next/navigation';
import { getPublicMenu, submitGuestVote, getGuestVotes } from '@/lib/api';

export default function GuestMenuPage() {
  const params = useParams();
  const slug = params.slug as string;

  const [menu, setMenu] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Guest state
  const [guestName, setGuestName] = useState('');
  const [selectedRecipes, setSelectedRecipes] = useState<Set<number>>(new Set());
  const [comments, setComments] = useState<Record<number, string>>({});
  const [hasVoted, setHasVoted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Recipe detail modal
  const [detailRecipe, setDetailRecipe] = useState<any>(null);

  // Load menu data
  useEffect(() => {
    setLoading(true);
    getPublicMenu(slug)
      .then((data) => {
        setMenu(data);
        // Track page view (fire-and-forget)
        fetch(`/api/guest-menus/public/${slug}/view`, { method: 'POST' }).catch(() => {});
        const savedName = localStorage.getItem(`guestmenu_${slug}_name`);
        if (savedName) {
          setGuestName(savedName);
          getGuestVotes(slug, savedName)
            .then((v) => {
              if (v.recipe_ids?.length > 0) {
                setSelectedRecipes(new Set(v.recipe_ids));
                if (v.comments) setComments(v.comments);
                setHasVoted(true);
              }
            })
            .catch(() => {});
        }
      })
      .catch((e) => {
        if (e.message?.includes('410')) {
          setError('This menu is no longer active.');
        } else if (e.message?.includes('404')) {
          setError('Menu not found.');
        } else {
          setError('Failed to load menu.');
        }
      })
      .finally(() => setLoading(false));
  }, [slug]);

  // Inject Google Fonts (3 fonts now: title, heading, body)
  useEffect(() => {
    if (!menu?.theme) return;
    const t = menu.theme;
    const fonts = [t.title_font, t.heading_font, t.body_font].filter(Boolean);
    if (fonts.length === 0) return;
    const families = fonts.map((f: string) => f.replace(/ /g, '+')).join('&family=');
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${families}:wght@300;400;500;600;700&display=swap`;
    document.head.appendChild(link);
    return () => { document.head.removeChild(link); };
  }, [menu?.theme?.title_font, menu?.theme?.heading_font, menu?.theme?.body_font]);

  const theme = menu?.theme || {};

  // Build a recipe lookup map for section rendering
  const recipeMap = useMemo(() => {
    if (!menu?.items) return new Map();
    const map = new Map<string, any>();
    for (const item of menu.items) {
      map.set(item.title, item);
      // Also index by lowercase for fuzzy matching
      map.set(item.title.toLowerCase(), item);
    }
    return map;
  }, [menu?.items]);

  // Build sections from theme or fallback to flat list
  const sections = useMemo(() => {
    if (!menu?.items) return [];
    const themeSections = theme.sections;
    if (!themeSections || !Array.isArray(themeSections) || themeSections.length === 0) {
      // Fallback: one flat section with all items
      return [{ title: '', items: menu.items }];
    }

    const usedIds = new Set<number>();
    const result: { title: string; items: any[] }[] = [];

    for (const section of themeSections) {
      const sectionItems: any[] = [];
      for (const itemTitle of (section.items || [])) {
        const recipe = recipeMap.get(itemTitle) || recipeMap.get(itemTitle.toLowerCase());
        if (recipe && !usedIds.has(recipe.recipe_id)) {
          sectionItems.push(recipe);
          usedIds.add(recipe.recipe_id);
        }
      }
      if (sectionItems.length > 0) {
        result.push({ title: section.title || '', items: sectionItems });
      }
    }

    // Any recipes not matched go into an "Other" section
    const remaining = menu.items.filter((item: any) => !usedIds.has(item.recipe_id));
    if (remaining.length > 0) {
      result.push({ title: 'MORE', items: remaining });
    }

    return result;
  }, [menu?.items, theme.sections, recipeMap]);

  const toggleRecipe = useCallback((recipeId: number) => {
    setSelectedRecipes((prev) => {
      const next = new Set(prev);
      if (next.has(recipeId)) next.delete(recipeId);
      else next.add(recipeId);
      return next;
    });
  }, []);

  const updateComment = useCallback((recipeId: number, text: string) => {
    setComments((prev) => ({ ...prev, [recipeId]: text }));
  }, []);

  const handleSubmitVotes = async () => {
    if (!guestName.trim() || selectedRecipes.size === 0) return;
    setSubmitting(true);
    try {
      // Build comments dict — only include non-empty comments for selected recipes
      const commentsDict: Record<number, string> = {};
      for (const rid of selectedRecipes) {
        if (comments[rid]?.trim()) commentsDict[rid] = comments[rid].trim();
      }
      await submitGuestVote(slug, {
        guest_name: guestName.trim(),
        recipe_ids: Array.from(selectedRecipes),
        comments: commentsDict,
      });
      localStorage.setItem(`guestmenu_${slug}_name`, guestName.trim());
      setHasVoted(true);
    } catch {
      alert('Failed to submit votes. Please try again.');
    }
    setSubmitting(false);
  };

  const handleChangeVotes = () => {
    setHasVoted(false);
  };

  // Theme-derived styles
  const titleFont = theme.title_font ? `'${theme.title_font}', cursive` : "'Playfair Display', serif";
  const headingFont = theme.heading_font ? `'${theme.heading_font}', serif` : "'Cormorant Garamond', serif";
  const bodyFont = theme.body_font ? `'${theme.body_font}', serif` : "'EB Garamond', serif";
  const menuMaxWidth = theme.menu_max_width || '580px';
  const dividerChar = theme.divider_char || '✦';
  const accentColor = theme.accent_color || '#8B7355';
  const headingColor = theme.heading_color || '#2c1810';
  const textColor = theme.text_color || '#3d2b1f';
  const mutedColor = theme.muted_color || '#8a7968';
  const menuBg = theme.menu_bg || '#faf6f0';

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem', animation: 'pulse 2s infinite' }}>🍽️</div>
          <div style={{ color: '#9ca3af', fontSize: '1.1rem' }}>Loading menu...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6' }}>
        <div style={{ textAlign: 'center', maxWidth: '400px', padding: '2rem' }}>
          <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>😔</div>
          <div style={{ color: '#6b7280', fontSize: '1.1rem' }}>{error}</div>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Full-viewport background */}
      <div
        style={{
          minHeight: '100vh',
          background: theme.background_gradient || theme.background_color || '#3d2b1f',
          position: 'relative',
        }}
      >
        {/* Pattern overlay */}
        {theme.pattern_css && (
          <div
            style={{
              position: 'fixed',
              inset: 0,
              background: theme.pattern_css,
              opacity: 0.15,
              pointerEvents: 'none',
              zIndex: 0,
            }}
          />
        )}

        {/* Centered menu paper */}
        <div
          style={{
            position: 'relative',
            zIndex: 1,
            maxWidth: menuMaxWidth,
            margin: '0 auto',
            padding: '2rem 0',
          }}
        >
          <div
            style={{
              background: menuBg,
              border: theme.menu_border || '2px solid #8B7355',
              boxShadow: [theme.menu_border_inset, theme.menu_shadow].filter(Boolean).join(', ') || '0 10px 40px rgba(0,0,0,0.3)',
              padding: 'clamp(1.5rem, 5vw, 3rem) clamp(1.25rem, 4vw, 2.5rem)',
              minHeight: '80vh',
              fontFamily: bodyFont,
              color: textColor,
            }}
          >
            {/* ─── Title Area ─── */}
            <header style={{ textAlign: 'center', marginBottom: '1.5rem', paddingTop: '0.5rem' }}>
              {theme.decorative_emoji && (
                <div style={{ fontSize: '2rem', marginBottom: '0.25rem', opacity: 0.8 }}>
                  {theme.decorative_emoji}
                </div>
              )}
              <h1 style={{
                fontFamily: titleFont,
                color: headingColor,
                fontSize: 'clamp(2.2rem, 7vw, 3.5rem)',
                fontWeight: 400,
                marginBottom: '0.3rem',
                lineHeight: 1.1,
                letterSpacing: '0.02em',
              }}>
                {menu.title}
              </h1>
              {theme.tagline && (
                <p style={{
                  color: accentColor,
                  fontStyle: 'italic',
                  fontSize: '1.05rem',
                  fontFamily: bodyFont,
                  letterSpacing: '0.03em',
                }}>
                  {theme.tagline}
                </p>
              )}

              {/* Top decorative divider */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                margin: '1.25rem 0 0',
              }}>
                <div style={{ flex: 1, height: '1px', background: theme.divider_line_css?.replace(/^1px solid /, '') || accentColor }} />
                <span style={{ color: accentColor, fontSize: '0.9rem', letterSpacing: '0.3em' }}>
                  {dividerChar} {dividerChar} {dividerChar}
                </span>
                <div style={{ flex: 1, height: '1px', background: theme.divider_line_css?.replace(/^1px solid /, '') || accentColor }} />
              </div>
            </header>

            {/* ─── Guest Name Input ─── */}
            <div style={{ textAlign: 'center', marginBottom: '1.75rem' }}>
              {hasVoted ? (
                <div>
                  <p style={{
                    fontFamily: headingFont,
                    color: headingColor,
                    fontSize: '1.1rem',
                    marginBottom: '0.25rem',
                    letterSpacing: '0.05em',
                  }}>
                    Thank you, {guestName}!
                  </p>
                  <p style={{ color: mutedColor, fontSize: '0.85rem', marginBottom: '0.5rem' }}>
                    Your selections have been recorded.
                  </p>
                  <button
                    onClick={handleChangeVotes}
                    style={{
                      background: 'transparent',
                      border: `1px solid ${accentColor}`,
                      color: accentColor,
                      padding: '0.4rem 1.25rem',
                      fontFamily: headingFont,
                      fontSize: '0.8rem',
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      cursor: 'pointer',
                    }}
                  >
                    Change Selections
                  </button>
                </div>
              ) : (
                <div>
                  <label style={{
                    display: 'block',
                    fontFamily: headingFont,
                    color: mutedColor,
                    fontSize: '0.85rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                    marginBottom: '0.4rem',
                  }}>
                    Your Name
                  </label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Enter your name..."
                    style={{
                      width: '100%',
                      maxWidth: '280px',
                      padding: '0.6rem 0',
                      border: 'none',
                      borderBottom: `1px solid ${accentColor}`,
                      background: 'transparent',
                      color: textColor,
                      fontSize: '1.05rem',
                      fontFamily: bodyFont,
                      textAlign: 'center',
                      outline: 'none',
                    }}
                  />
                </div>
              )}
            </div>

            {/* ─── Menu Sections ─── */}
            {sections.map((section, sIdx) => (
              <div key={sIdx} style={{ marginBottom: '1.5rem' }}>
                {/* Section divider */}
                {section.title && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.75rem',
                    margin: '1.5rem 0 1rem',
                  }}>
                    <div style={{ flex: 1, height: '1px', background: theme.divider_line_css?.replace(/^1px solid /, '') || accentColor, opacity: 0.5 }} />
                    <span style={{
                      color: accentColor,
                      fontSize: '0.75rem',
                    }}>
                      {dividerChar}
                    </span>
                    <h2 style={{
                      fontFamily: headingFont,
                      color: headingColor,
                      fontSize: '0.95rem',
                      fontWeight: 600,
                      letterSpacing: '0.2em',
                      textTransform: 'uppercase',
                      margin: 0,
                      whiteSpace: 'nowrap',
                    }}>
                      {section.title}
                    </h2>
                    <span style={{
                      color: accentColor,
                      fontSize: '0.75rem',
                    }}>
                      {dividerChar}
                    </span>
                    <div style={{ flex: 1, height: '1px', background: theme.divider_line_css?.replace(/^1px solid /, '') || accentColor, opacity: 0.5 }} />
                  </div>
                )}

                {/* Dish rows */}
                {section.items.map((item: any) => {
                  const isSelected = selectedRecipes.has(item.recipe_id);

                  return (
                    <div
                      key={item.recipe_id}
                      style={{
                        position: 'relative',
                        padding: '0.7rem 0.75rem',
                        margin: '0 -0.75rem',
                        borderRadius: '4px',
                        cursor: !hasVoted ? 'pointer' : 'default',
                        transition: 'all 0.25s ease',
                        background: isSelected
                          ? `${theme.checkbox_checked_bg || accentColor}12`
                          : 'transparent',
                        borderLeft: isSelected
                          ? `3px solid ${theme.checkbox_checked_bg || accentColor}`
                          : '3px solid transparent',
                      }}
                      onClick={() => {
                        if (!hasVoted) toggleRecipe(item.recipe_id);
                      }}
                    >
                      <div style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: '0.5rem',
                      }}>
                        {/* Check indicator */}
                        <div
                          style={{
                          width: '1.6rem',
                          height: '1.6rem',
                          borderRadius: '4px',
                          border: isSelected
                            ? `2px solid ${theme.checkbox_checked_bg || accentColor}`
                            : `1.5px solid ${theme.checkbox_border || mutedColor}`,
                          background: isSelected
                            ? (theme.checkbox_checked_bg || accentColor)
                            : 'transparent',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                          transition: 'all 0.2s ease',
                          marginTop: '0.15rem',
                        }}>
                          {isSelected && (
                            <span style={{
                              color: theme.checkbox_checked_color || '#fff',
                              fontSize: '0.8rem',
                              fontWeight: 700,
                              lineHeight: 1,
                            }}>
                              ✓
                            </span>
                          )}
                        </div>

                        {/* Dish name and description */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{
                            fontSize: '1.05rem',
                            fontWeight: 500,
                            color: textColor,
                            lineHeight: 1.4,
                          }}>
                            {item.title}
                          </div>
                          {item.description && (
                            <div style={{
                              fontSize: '0.82rem',
                              color: mutedColor,
                              fontStyle: 'italic',
                              lineHeight: 1.4,
                              marginTop: '0.15rem',
                            }}>
                              {item.description.length > 100
                                ? item.description.slice(0, 100) + '…'
                                : item.description}
                            </div>
                          )}
                          {item.subtext && (
                            <div style={{
                              fontSize: '0.8rem',
                              color: accentColor,
                              lineHeight: 1.4,
                              marginTop: '0.2rem',
                            }}>
                              {item.subtext}
                            </div>
                          )}
                        </div>

                        {/* Info button — opens detail modal */}
                        <div
                          onClick={(e) => {
                            e.stopPropagation();
                            setDetailRecipe(item);
                          }}
                          style={{
                            color: mutedColor,
                            fontSize: '0.85rem',
                            cursor: 'pointer',
                            opacity: 0.5,
                            padding: '0.15rem 0.3rem',
                            flexShrink: 0,
                            marginTop: '0.1rem',
                          }}
                          title="View recipe details"
                        >
                          ℹ
                        </div>
                      </div>

                      {/* Inline comment input when selected (pre-vote) */}
                      {isSelected && !hasVoted && (
                        <div style={{ marginTop: '0.4rem', paddingLeft: '0' }}>
                          <input
                            type="text"
                            value={comments[item.recipe_id] || ''}
                            onChange={(e) => updateComment(item.recipe_id, e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                            placeholder="Any requests or notes? (optional)"
                            maxLength={500}
                            style={{
                              width: '100%',
                              padding: '0.3rem 0',
                              border: 'none',
                              borderBottom: `1px solid ${accentColor}40`,
                              background: 'transparent',
                              color: textColor,
                              fontSize: '0.82rem',
                              fontFamily: bodyFont,
                              fontStyle: 'italic',
                              outline: 'none',
                            }}
                          />
                        </div>
                      )}

                      {/* Show comment in post-vote summary */}
                      {isSelected && hasVoted && comments[item.recipe_id] && (
                        <div style={{
                          marginTop: '0.3rem',
                          fontSize: '0.8rem',
                          color: mutedColor,
                          fontStyle: 'italic',
                        }}>
                          {comments[item.recipe_id]}
                        </div>
                      )}

                      {/* Subtle bottom line */}
                      <div style={{
                        position: 'absolute',
                        bottom: 0,
                        left: '0.75rem',
                        right: '0.75rem',
                        height: '1px',
                        background: accentColor,
                        opacity: 0.12,
                      }} />
                    </div>
                  );
                })}
              </div>
            ))}

            {/* ─── Submit Button ─── */}
            {!hasVoted && guestName.trim() && selectedRecipes.size > 0 && (
              <div style={{ textAlign: 'center', margin: '2rem 0 1.5rem' }}>
                <button
                  onClick={handleSubmitVotes}
                  disabled={submitting}
                  style={{
                    padding: '0.75rem 2.5rem',
                    background: theme.button_bg || accentColor,
                    color: theme.button_text || '#fff',
                    border: theme.button_border || 'none',
                    fontFamily: headingFont,
                    fontSize: '0.9rem',
                    fontWeight: 600,
                    letterSpacing: '0.15em',
                    textTransform: 'uppercase',
                    cursor: submitting ? 'wait' : 'pointer',
                    opacity: submitting ? 0.7 : 1,
                    transition: 'all 0.2s ease',
                  }}
                >
                  {submitting ? 'Submitting...' : `Submit Selections · ${selectedRecipes.size}`}
                </button>
              </div>
            )}

            {/* ─── Bottom decorative divider ─── */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              margin: '2rem 0 1rem',
            }}>
              <div style={{ flex: 1, height: '1px', background: theme.divider_line_css?.replace(/^1px solid /, '') || accentColor }} />
              <span style={{ color: accentColor, fontSize: '0.9rem', letterSpacing: '0.3em' }}>
                {dividerChar} {dividerChar} {dividerChar}
              </span>
              <div style={{ flex: 1, height: '1px', background: theme.divider_line_css?.replace(/^1px solid /, '') || accentColor }} />
            </div>

            {/* ─── Footer ─── */}
            <footer style={{
              textAlign: 'center',
              color: mutedColor,
              fontSize: '0.7rem',
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              opacity: 0.6,
            }}>
              Powered by DukeCook
            </footer>
          </div>
        </div>
      </div>

      {/* ─── Recipe Detail Modal ─── */}
      {detailRecipe && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 100,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'flex-end',
            justifyContent: 'center',
          }}
          onClick={() => setDetailRecipe(null)}
        >
          <div
            style={{
              width: '100%',
              maxWidth: '700px',
              maxHeight: '90vh',
              overflowY: 'auto',
              background: menuBg,
              borderRadius: '12px 12px 0 0',
              color: textColor,
              fontFamily: bodyFont,
              animation: 'slideUp 0.3s ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal image */}
            {(detailRecipe.image_path || detailRecipe.image_url) && (
              <div style={{ height: '250px', overflow: 'hidden', borderRadius: '12px 12px 0 0' }}>
                <img
                  src={detailRecipe.image_path || detailRecipe.image_url}
                  alt={detailRecipe.title}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              </div>
            )}

            <div style={{ padding: '1.5rem' }}>
              {/* Close button + title */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1rem' }}>
                <h2 style={{
                  fontFamily: headingFont,
                  color: headingColor,
                  fontSize: '1.5rem',
                  fontWeight: 600,
                  flex: 1,
                  letterSpacing: '0.02em',
                }}>
                  {detailRecipe.title}
                </h2>
                <button
                  onClick={() => setDetailRecipe(null)}
                  style={{
                    background: `${accentColor}15`,
                    border: 'none',
                    borderRadius: '50%',
                    width: '2rem',
                    height: '2rem',
                    cursor: 'pointer',
                    color: textColor,
                    fontSize: '1rem',
                    flexShrink: 0,
                    marginLeft: '1rem',
                  }}
                >
                  ✕
                </button>
              </div>

              {detailRecipe.description && (
                <p style={{ color: mutedColor, marginBottom: '1rem', lineHeight: 1.6, fontStyle: 'italic' }}>
                  {detailRecipe.description}
                </p>
              )}

              {/* Meta */}
              <div style={{
                display: 'flex',
                gap: '1rem',
                flexWrap: 'wrap',
                marginBottom: '1.5rem',
                fontSize: '0.85rem',
                color: mutedColor,
              }}>
                {detailRecipe.cuisine && <span>🌍 {detailRecipe.cuisine}</span>}
                {detailRecipe.prep_time_min && <span>⏱ {detailRecipe.prep_time_min + (detailRecipe.cook_time_min || 0)} min</span>}
                {detailRecipe.servings && <span>👥 {detailRecipe.servings} servings</span>}
                {detailRecipe.difficulty && <span style={{ textTransform: 'capitalize' }}>📊 {detailRecipe.difficulty}</span>}
              </div>

              {/* Ingredients */}
              {detailRecipe.ingredients?.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{
                    fontFamily: headingFont,
                    color: headingColor,
                    fontSize: '1rem',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}>
                    Ingredients
                  </h3>
                  <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
                    {detailRecipe.ingredients.map((ing: any, i: number) => (
                      <li
                        key={i}
                        style={{
                          padding: '0.4rem 0',
                          borderBottom: `1px solid ${accentColor}10`,
                          fontSize: '0.9rem',
                        }}
                      >
                        {ing.raw_text}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Steps */}
              {detailRecipe.steps?.length > 0 && (
                <div style={{ marginBottom: '1.5rem' }}>
                  <h3 style={{
                    fontFamily: headingFont,
                    color: headingColor,
                    fontSize: '1rem',
                    fontWeight: 600,
                    marginBottom: '0.75rem',
                    letterSpacing: '0.1em',
                    textTransform: 'uppercase',
                  }}>
                    Preparation
                  </h3>
                  <ol style={{ padding: 0, margin: 0, counterReset: 'steps' }}>
                    {detailRecipe.steps.map((step: any, i: number) => (
                      <li
                        key={i}
                        style={{
                          padding: '0.6rem 0',
                          borderBottom: `1px solid ${accentColor}10`,
                          fontSize: '0.9rem',
                          lineHeight: 1.6,
                          display: 'flex',
                          gap: '0.75rem',
                        }}
                      >
                        <span style={{
                          color: accentColor,
                          fontWeight: 600,
                          flexShrink: 0,
                        }}>
                          {i + 1}.
                        </span>
                        <span>{step.instruction}</span>
                      </li>
                    ))}
                  </ol>
                </div>
              )}

              {/* Notes */}
              {detailRecipe.notes && (
                <div style={{
                  background: `${accentColor}08`,
                  borderLeft: `3px solid ${accentColor}`,
                  padding: '1rem',
                  fontSize: '0.85rem',
                  lineHeight: 1.6,
                  color: mutedColor,
                  fontStyle: 'italic',
                }}>
                  <strong style={{ color: headingColor, fontStyle: 'normal' }}>Chef&apos;s Notes: </strong>
                  {detailRecipe.notes}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Animations */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        * { box-sizing: border-box; }
        body { margin: 0; padding: 0; }
      `}</style>
    </>
  );
}
