'use client';

import { useState, useEffect, useContext, useRef } from 'react';
import { createPortal } from 'react-dom';
import {
  getWeekPlan, getMonthPlan, getRecipes, addToPlan, deletePlan,
  updatePlan, suggestMeals, addCalendarEvent, deleteCalendarEvent,
} from '@/lib/api';
import { UserContext } from '@/lib/user-context';
import Link from 'next/link';
import { format, addDays, subDays, startOfWeek, addMonths, subMonths } from 'date-fns';

// Returns today as 'yyyy-MM-dd' once mounted on the client. Returns '' during
// SSR + first render to avoid hydration mismatches when server "today" differs
// from client "today" (timezone / day-rollover).
function useToday(): string {
  const [today, setToday] = useState('');
  useEffect(() => { setToday(format(new Date(), 'yyyy-MM-dd')); }, []);
  return today;
}

// ─── Event type config ───
const EVENT_TYPES = [
  { value: 'special', label: 'Special Event', color: '#8B5CF6', icon: '⭐' },
  { value: 'dinner_party', label: 'Dinner Party', color: '#EC4899', icon: '🎉' },
  { value: 'holiday', label: 'Holiday', color: '#EF4444', icon: '🎄' },
  { value: 'birthday', label: 'Birthday', color: '#F59E0B', icon: '🎂' },
  { value: 'block', label: 'Block Night', color: '#6B7280', icon: '🚫' },
];

function getEventStyle(event: any) {
  if (event.color) return { bg: `${event.color}18`, border: event.color, text: event.color };
  const type = EVENT_TYPES.find(t => t.value === event.event_type);
  if (type) return { bg: `${type.color}18`, border: type.color, text: type.color };
  if (event.is_dinner_conflict) return { bg: '#FEE2E2', border: '#EF4444', text: '#DC2626' };
  return { bg: '#F3F4F6', border: '#D1D5DB', text: '#6B7280' };
}

function getEventIcon(event: any) {
  const type = EVENT_TYPES.find(t => t.value === event.event_type);
  if (type && event.event_type !== 'block') return type.icon;
  if (event.source === 'homeassistant') return '📅';
  return '🚫';
}

// ─── Recipe search combobox ───
function RecipeCombobox({ recipes, value, onChange }: { recipes: any[]; value: number | null; onChange: (id: number | null) => void }) {
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const selectedTitle = recipes.find(r => r.id === value)?.title || '';

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const updatePos = () => {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
    }
  };

  const filtered = search.length > 0
    ? recipes.filter(r => r.title.toLowerCase().includes(search.toLowerCase()))
    : [];

  return (
    <div ref={ref} className="relative flex-1">
      <input
        ref={inputRef}
        className="input w-full"
        placeholder="Type to search recipes..."
        value={open ? search : selectedTitle}
        onChange={(e) => { setSearch(e.target.value); setOpen(true); onChange(null); updatePos(); }}
        onFocus={() => { setOpen(true); setSearch(''); updatePos(); }}
        autoFocus
      />
      {open && search.length > 0 && dropdownPos && typeof document !== 'undefined' && createPortal(
        <ul
          style={{ position: 'fixed', top: dropdownPos.top, left: dropdownPos.left, width: dropdownPos.width, zIndex: 9999 }}
          className="max-h-60 overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-gray-400">No recipes found</li>
          ) : (
            filtered.map(r => (
              <li
                key={r.id}
                className="px-3 py-2 text-sm cursor-pointer hover:bg-brand-50 hover:text-brand-700"
                onMouseDown={() => { onChange(r.id); setSearch(r.title); setOpen(false); }}
              >
                {r.title}
              </li>
            ))
          )}
        </ul>,
        document.body
      )}
    </div>
  );
}

// ─── Add Event Dialog ───
function AddEventDialog({ date, onClose, onSave }: { date: string; onClose: () => void; onSave: (data: any) => void }) {
  const [summary, setSummary] = useState('');
  const [eventType, setEventType] = useState('special');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [description, setDescription] = useState('');
  const [guestCount, setGuestCount] = useState('');
  const [color, setColor] = useState('');
  const [isDinnerConflict, setIsDinnerConflict] = useState(false);

  const selectedType = EVENT_TYPES.find(t => t.value === eventType);
  const effectiveColor = color || selectedType?.color || '';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl shadow-xl w-full max-w-md" onClick={e => e.stopPropagation()}>
        <div className="p-5">
          <h3 className="text-lg font-bold mb-4">Add Event — {format(new Date(date + 'T12:00:00'), 'EEE, MMM d')}</h3>

          <div className="space-y-3">
            <input
              className="input"
              placeholder="Event name"
              value={summary}
              onChange={e => setSummary(e.target.value)}
              autoFocus
            />

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Event Type</label>
              <div className="flex flex-wrap gap-2">
                {EVENT_TYPES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => setEventType(t.value)}
                    className={`px-3 py-1.5 rounded-full text-sm border transition-all ${
                      eventType === t.value
                        ? 'border-brand-500 bg-brand-50 text-brand-700 font-medium'
                        : 'border-gray-200 text-gray-600 hover:border-gray-300'
                    }`}
                  >
                    {t.icon} {t.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex gap-3">
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">Start Time</label>
                <input type="time" className="input" value={startTime} onChange={e => setStartTime(e.target.value)} />
              </div>
              <div className="flex-1">
                <label className="text-xs text-gray-500 mb-1 block">End Time</label>
                <input type="time" className="input" value={endTime} onChange={e => setEndTime(e.target.value)} />
              </div>
            </div>

            {(eventType === 'dinner_party' || eventType === 'special') && (
              <div>
                <label className="text-xs text-gray-500 mb-1 block">Guest Count</label>
                <input
                  type="number"
                  className="input"
                  placeholder="Number of guests"
                  value={guestCount}
                  onChange={e => setGuestCount(e.target.value)}
                  min="0"
                />
              </div>
            )}

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Description / Notes</label>
              <textarea
                className="input"
                rows={2}
                placeholder="Details about the event..."
                value={description}
                onChange={e => setDescription(e.target.value)}
              />
            </div>

            <div>
              <label className="text-xs text-gray-500 mb-1 block">Color</label>
              <div className="flex gap-2 items-center">
                <input
                  type="color"
                  value={effectiveColor || '#8B5CF6'}
                  onChange={e => setColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border-0"
                />
                <span className="text-xs text-gray-400">{effectiveColor || 'Default'}</span>
                {color && (
                  <button onClick={() => setColor('')} className="text-xs text-gray-400 hover:text-gray-600">Reset</button>
                )}
              </div>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={isDinnerConflict}
                onChange={e => setIsDinnerConflict(e.target.checked)}
                className="rounded"
              />
              Blocks dinner planning for this night
            </label>
          </div>

          <div className="flex gap-2 mt-5">
            <button onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button
              onClick={() => {
                if (!summary.trim()) return;
                onSave({
                  date,
                  summary: summary.trim(),
                  event_type: eventType,
                  start_time: startTime || null,
                  end_time: endTime || null,
                  description: description.trim(),
                  guest_count: guestCount ? parseInt(guestCount) : null,
                  color: color || '',
                  is_dinner_conflict: isDinnerConflict,
                });
              }}
              disabled={!summary.trim()}
              className="btn-primary flex-1"
            >
              Add Event
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Day Detail Panel ───
function DayDetail({
  day, recipes, onAddMeal, onRemoveMeal, onMarkCooked, onAddEvent, onRemoveEvent, onClose,
}: {
  day: any;
  recipes: any[];
  onAddMeal: (date: string, recipeId: number) => void;
  onRemoveMeal: (planId: number) => void;
  onMarkCooked: (planId: number) => void;
  onAddEvent: (date: string) => void;
  onRemoveEvent: (eventId: number) => void;
  onClose: () => void;
}) {
  const [showAddMeal, setShowAddMeal] = useState(false);
  const [selectedRecipe, setSelectedRecipe] = useState<number | null>(null);
  const today = useToday();
  const isToday = !!today && day.date === today;

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50" onClick={onClose}>
      <div
        className="bg-white rounded-t-xl sm:rounded-xl shadow-xl w-full sm:max-w-lg max-h-[85vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold flex items-center gap-2">
                {day.day_name}
                {isToday && <span className="badge bg-brand-100 text-brand-700 text-xs">Today</span>}
              </h3>
              <span className="text-sm text-gray-400">{day.date}</span>
            </div>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 text-xl p-1">✕</button>
          </div>

          {/* Events */}
          {day.calendar_events?.length > 0 && (
            <div className="mb-4">
              <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Events</h4>
              <div className="space-y-1.5">
                {day.calendar_events.map((e: any, idx: number) => {
                  const style = getEventStyle(e);
                  return (
                    <div
                      key={e.id || `ha-${idx}`}
                      className="flex items-start gap-2 p-2 rounded-lg text-sm"
                      style={{ background: style.bg, borderLeft: `3px solid ${style.border}` }}
                    >
                      <span>{getEventIcon(e)}</span>
                      <div className="flex-1 min-w-0">
                        <div className="font-medium" style={{ color: style.text }}>{e.summary}</div>
                        {e.start_time && <span className="text-xs text-gray-500">{e.start_time}{e.end_time ? ` — ${e.end_time}` : ''}</span>}
                        {e.description && <div className="text-xs text-gray-500 mt-0.5">{e.description}</div>}
                        {e.guest_count && <span className="text-xs text-gray-500"> · {e.guest_count} guests</span>}
                      </div>
                      {e.id && e.source !== 'homeassistant' && (
                        <button onClick={() => onRemoveEvent(e.id)} className="text-xs text-gray-400 hover:text-red-500 p-1">✕</button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Meals */}
          <div className="mb-4">
            <h4 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Meals</h4>
            {day.meals?.length > 0 ? (
              <div className="space-y-2">
                {day.meals.map((m: any) => (
                  <div key={m.id} className="flex items-center gap-3 p-2.5 bg-gray-50 rounded-lg">
                    <span className="text-xl">{m.status === 'cooked' ? '✅' : '🍽'}</span>
                    <Link href={`/recipes/${m.recipe_id}`} className="flex-1 font-medium hover:text-brand-600 truncate">
                      {m.recipe_title}
                    </Link>
                    <div className="flex gap-1 flex-shrink-0">
                      {m.status !== 'cooked' && (
                        <>
                          <Link href={`/cook/${m.recipe_id}`} className="text-sm text-brand-500 hover:underline">Cook</Link>
                          <button onClick={() => onMarkCooked(m.id)} className="text-sm text-green-500 hover:underline ml-1">Done</button>
                        </>
                      )}
                      <button onClick={() => onRemoveMeal(m.id)} className="text-sm text-red-400 hover:text-red-600 ml-1">✕</button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-gray-400 italic">
                {day.available ? 'No meals planned' : 'Not cooking tonight'}
              </p>
            )}
          </div>

          {/* Add meal */}
          {showAddMeal ? (
            <div className="flex gap-2 mb-3">
              <RecipeCombobox recipes={recipes} value={selectedRecipe} onChange={setSelectedRecipe} />
              <button
                onClick={() => { if (selectedRecipe) { onAddMeal(day.date, selectedRecipe); setShowAddMeal(false); setSelectedRecipe(null); } }}
                disabled={!selectedRecipe}
                className="btn-primary text-sm"
              >
                Add
              </button>
              <button onClick={() => setShowAddMeal(false)} className="btn-secondary text-sm">✕</button>
            </div>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => setShowAddMeal(true)} className="text-sm text-brand-500 hover:underline">+ Add Meal</button>
              <button onClick={() => onAddEvent(day.date)} className="text-sm text-purple-500 hover:underline ml-2">+ Add Event</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Week View (Portrait) ───
function WeekView({ weekPlan, onDayClick }: { weekPlan: any; onDayClick: (day: any) => void }) {
  const today = useToday();

  return (
    <div className="grid grid-cols-7 gap-1.5 sm:gap-2">
      {weekPlan?.days?.map((day: any) => {
        const isToday = day.date === today;
        const isPast = day.date < today;
        const hasEvents = day.calendar_events?.length > 0;
        const hasMeals = day.meals?.length > 0;
        const hasSpecial = day.calendar_events?.some((e: any) => e.event_type && e.event_type !== 'block');

        return (
          <div
            key={day.date}
            onClick={() => onDayClick(day)}
            className={`card cursor-pointer transition-all hover:shadow-md flex flex-col min-h-[180px] sm:min-h-[220px] ${
              isToday ? 'ring-2 ring-brand-500' : ''
            } ${isPast ? 'opacity-60' : ''}`}
          >
            {/* Day header */}
            <div className={`px-2 py-1.5 text-center border-b ${isToday ? 'bg-brand-500 text-white' : 'bg-gray-50'}`}>
              <div className={`text-xs font-semibold uppercase ${isToday ? '' : 'text-gray-500'}`}>
                {day.day_name.slice(0, 3)}
              </div>
              <div className={`text-lg font-bold ${isToday ? '' : 'text-gray-800'}`}>
                {day.date.split('-')[2]}
              </div>
            </div>

            {/* Day content */}
            <div className="flex-1 p-1.5 space-y-1 overflow-hidden">
              {/* Availability badge */}
              {!day.available && (
                <div className="text-[10px] text-center py-0.5 rounded bg-red-50 text-red-500 font-medium">Busy</div>
              )}

              {/* Events */}
              {day.calendar_events?.map((e: any, idx: number) => {
                const style = getEventStyle(e);
                return (
                  <div
                    key={e.id || `ev-${idx}`}
                    className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded truncate"
                    style={{ background: style.bg, color: style.text, borderLeft: `2px solid ${style.border}` }}
                    title={e.summary}
                  >
                    {getEventIcon(e)} {e.summary}
                  </div>
                );
              })}

              {/* Meals */}
              {day.meals?.map((m: any) => (
                <div
                  key={m.id}
                  className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded truncate bg-brand-50 text-brand-700 border-l-2 border-brand-400"
                  title={m.recipe_title}
                >
                  {m.status === 'cooked' ? '✅' : '🍽'} {m.recipe_title}
                </div>
              ))}

              {/* Empty state */}
              {!hasEvents && !hasMeals && day.available && (
                <div className="text-[10px] text-gray-300 text-center mt-2">Open</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Month View ───
function MonthView({ monthPlan, month, year, onDayClick }: { monthPlan: any; month: number; year: number; onDayClick: (day: any) => void }) {
  const today = useToday();

  // Calculate which day of the week the 1st falls on (0=Mon for our grid)
  const firstDay = new Date(year, month - 1, 1);
  const startDow = (firstDay.getDay() + 6) % 7; // Convert Sun=0 to Mon=0

  // Build grid cells: leading blanks + actual days
  const cells: (any | null)[] = [];
  for (let i = 0; i < startDow; i++) cells.push(null);
  if (monthPlan?.days) {
    for (const day of monthPlan.days) cells.push(day);
  }
  // Pad to complete week
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div>
      {/* Header row */}
      <div className="grid grid-cols-7 gap-px mb-1">
        {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => (
          <div key={d} className="text-xs font-semibold text-gray-500 text-center py-1">{d}</div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 gap-px bg-gray-200 rounded-lg overflow-hidden">
        {cells.map((day, idx) => {
          if (!day) {
            return <div key={`blank-${idx}`} className="bg-gray-50 min-h-[80px] sm:min-h-[100px]" />;
          }
          const isToday = day.date === today;
          const isPast = day.date < today;
          const dayNum = parseInt(day.date.split('-')[2]);

          return (
            <div
              key={day.date}
              onClick={() => onDayClick(day)}
              className={`bg-white cursor-pointer hover:bg-gray-50 transition-colors min-h-[80px] sm:min-h-[100px] p-1 ${
                isPast ? 'opacity-50' : ''
              }`}
            >
              {/* Day number */}
              <div className="flex items-center justify-between mb-0.5">
                <span className={`text-xs sm:text-sm font-medium inline-flex items-center justify-center w-6 h-6 rounded-full ${
                  isToday ? 'bg-brand-500 text-white' : 'text-gray-700'
                }`}>
                  {dayNum}
                </span>
                {!day.available && <span className="w-1.5 h-1.5 rounded-full bg-red-400" title="Busy" />}
              </div>

              {/* Compact event/meal indicators */}
              <div className="space-y-0.5 overflow-hidden">
                {day.calendar_events?.slice(0, 2).map((e: any, idx: number) => {
                  const style = getEventStyle(e);
                  return (
                    <div
                      key={e.id || `ev-${idx}`}
                      className="text-[9px] sm:text-[10px] px-1 py-px rounded truncate leading-tight"
                      style={{ background: style.bg, color: style.text }}
                    >
                      {getEventIcon(e)} {e.summary}
                    </div>
                  );
                })}
                {day.meals?.slice(0, 2).map((m: any) => (
                  <div
                    key={m.id}
                    className="text-[9px] sm:text-[10px] px-1 py-px rounded truncate leading-tight bg-brand-50 text-brand-700"
                  >
                    🍽 {m.recipe_title}
                  </div>
                ))}
                {((day.calendar_events?.length || 0) + (day.meals?.length || 0)) > 2 && (
                  <div className="text-[9px] text-gray-400 text-center">
                    +{(day.calendar_events?.length || 0) + (day.meals?.length || 0) - 2} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Main Planner Page ───
export default function PlannerPage() {
  const { currentUser } = useContext(UserContext);
  const [view, setView] = useState<'week' | 'month'>('week');
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date(), { weekStartsOn: 1 }));
  const [monthDate, setMonthDate] = useState(() => new Date());

  const [weekPlan, setWeekPlan] = useState<any>(null);
  const [monthPlan, setMonthPlan] = useState<any>(null);
  const [recipes, setRecipes] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [suggesting, setSuggesting] = useState(false);

  const [selectedDay, setSelectedDay] = useState<any>(null);
  const [addEventDate, setAddEventDate] = useState<string | null>(null);

  // Load data based on view
  useEffect(() => {
    setLoading(true);
    if (view === 'week') {
      getWeekPlan(format(weekStart, 'yyyy-MM-dd'))
        .then(setWeekPlan)
        .catch(() => setWeekPlan(null))
        .finally(() => setLoading(false));
    } else {
      const y = monthDate.getFullYear();
      const m = monthDate.getMonth() + 1;
      getMonthPlan(y, m)
        .then(setMonthPlan)
        .catch(() => setMonthPlan(null))
        .finally(() => setLoading(false));
    }
  }, [view, weekStart, monthDate]);

  // Load recipes once
  useEffect(() => { getRecipes({ limit: '200' }).then(setRecipes).catch(() => {}); }, []);

  const reload = () => {
    if (view === 'week') {
      getWeekPlan(format(weekStart, 'yyyy-MM-dd')).then(setWeekPlan).catch(() => {});
    } else {
      const y = monthDate.getFullYear();
      const m = monthDate.getMonth() + 1;
      getMonthPlan(y, m).then(setMonthPlan).catch(() => {});
    }
  };

  const handleAddMeal = async (dateStr: string, recipeId: number) => {
    await addToPlan({ date: dateStr, recipe_id: recipeId, meal_type: 'dinner' });
    setSelectedDay(null);
    reload();
  };

  const handleRemoveMeal = async (planId: number) => {
    if (!confirm('Remove this meal from the plan?')) return;
    await deletePlan(planId);
    reload();
  };

  const handleMarkCooked = async (planId: number) => {
    await updatePlan(planId, { status: 'cooked' });
    reload();
  };

  const handleSaveEvent = async (data: any) => {
    await addCalendarEvent(data);
    setAddEventDate(null);
    reload();
  };

  const handleRemoveEvent = async (eventId: number) => {
    await deleteCalendarEvent(eventId);
    reload();
  };

  const handleSuggest = async () => {
    if (!weekPlan) return;
    setSuggesting(true);
    try {
      const available = weekPlan.days
        .filter((d: any) => d.available && d.meals.length === 0)
        .map((d: any) => d.date);
      if (available.length === 0) { alert('No available nights to fill!'); return; }
      const result = await suggestMeals({
        week_start: format(weekStart, 'yyyy-MM-dd'),
        available_dates: available,
        context: 'dinner',
      });
      if (result.suggestions?.length > 0) {
        for (const s of result.suggestions) {
          await addToPlan({ date: s.date, recipe_id: s.recipe_id, meal_type: 'dinner', notes: s.reason || '' });
        }
        reload();
      }
    } finally {
      setSuggesting(false);
    }
  };

  const handleDayClick = (day: any) => {
    setSelectedDay(day);
  };

  const handlePrev = () => {
    if (view === 'week') setWeekStart(subDays(weekStart, 7));
    else setMonthDate(subMonths(monthDate, 1));
  };

  const handleNext = () => {
    if (view === 'week') setWeekStart(addDays(weekStart, 7));
    else setMonthDate(addMonths(monthDate, 1));
  };

  const handleToday = () => {
    if (view === 'week') setWeekStart(startOfWeek(new Date(), { weekStartsOn: 1 }));
    else setMonthDate(new Date());
  };

  const title = view === 'week'
    ? `${format(weekStart, 'MMM d')} — ${format(addDays(weekStart, 6), 'MMM d, yyyy')}`
    : format(monthDate, 'MMMM yyyy');

  return (
    <div className="space-y-4">
      {/* Top bar: view toggle + navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-3">
        {/* View toggle */}
        <div className="flex rounded-lg border border-gray-200 overflow-hidden flex-shrink-0">
          <button
            onClick={() => setView('week')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              view === 'week' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Week
          </button>
          <button
            onClick={() => setView('month')}
            className={`px-4 py-1.5 text-sm font-medium transition-colors ${
              view === 'month' ? 'bg-brand-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'
            }`}
          >
            Month
          </button>
        </div>

        {/* Navigation */}
        <div className="flex items-center gap-2 flex-1 justify-center sm:justify-start">
          <button onClick={handlePrev} className="btn-secondary text-sm px-3 py-1.5">←</button>
          <button onClick={handleToday} className="btn-secondary text-sm px-3 py-1.5">Today</button>
          <button onClick={handleNext} className="btn-secondary text-sm px-3 py-1.5">→</button>
          <h1 className="text-lg sm:text-xl font-bold ml-2">{title}</h1>
        </div>
      </div>

      {/* Actions bar */}
      {view === 'week' && (
        <div className="flex gap-3">
          <button onClick={handleSuggest} disabled={suggesting} className="btn-primary flex-1 text-sm">
            {suggesting ? 'Thinking...' : 'AI Suggest Meals for Open Nights'}
          </button>
        </div>
      )}

      {/* Rule status (week view only) */}
      {view === 'week' && weekPlan?.rule_status?.length > 0 && (
        <div className="card p-3">
          <div className="flex flex-wrap gap-2">
            {weekPlan.rule_status.map((r: any) => (
              <span
                key={r.rule_id}
                className={`badge ${
                  r.status === 'ok' ? 'bg-green-100 text-green-700'
                  : r.status === 'warning' ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-red-100 text-red-700'
                }`}
              >
                {r.status === 'ok' ? '✓' : r.status === 'warning' ? '⚠' : '✗'} {r.message}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Calendar views */}
      {loading ? (
        <div className="text-center py-12 text-gray-400">Loading planner...</div>
      ) : view === 'week' ? (
        <WeekView weekPlan={weekPlan} onDayClick={handleDayClick} />
      ) : (
        <MonthView
          monthPlan={monthPlan}
          month={monthDate.getMonth() + 1}
          year={monthDate.getFullYear()}
          onDayClick={handleDayClick}
        />
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-3 text-xs text-gray-500">
        <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-brand-100 border-l-2 border-brand-400" /> Meal</span>
        {EVENT_TYPES.filter(t => t.value !== 'block').map(t => (
          <span key={t.value} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded" style={{ background: `${t.color}25`, borderLeft: `2px solid ${t.color}` }} />
            {t.icon} {t.label}
          </span>
        ))}
      </div>

      {/* Day detail panel */}
      {selectedDay && (
        <DayDetail
          day={selectedDay}
          recipes={recipes}
          onAddMeal={handleAddMeal}
          onRemoveMeal={handleRemoveMeal}
          onMarkCooked={handleMarkCooked}
          onAddEvent={(date) => { setSelectedDay(null); setAddEventDate(date); }}
          onRemoveEvent={handleRemoveEvent}
          onClose={() => setSelectedDay(null)}
        />
      )}

      {/* Add event dialog */}
      {addEventDate && (
        <AddEventDialog
          date={addEventDate}
          onClose={() => setAddEventDate(null)}
          onSave={handleSaveEvent}
        />
      )}
    </div>
  );
}
