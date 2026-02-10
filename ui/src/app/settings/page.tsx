'use client';

import { useState, useEffect, useContext } from 'react';
import { getRules, createRule, updateRule, deleteRule, getPantryStaples, getTasteProfile, compareTastes, getTasteInsights } from '@/lib/api';
import { UserContext } from '@/app/layout';

export default function SettingsPage() {
  const { currentUser, users } = useContext(UserContext);
  const [tab, setTab] = useState<'rules' | 'pantry' | 'taste'>('rules');

  return (
    <div className="space-y-4 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold">⚙️ Settings</h1>

      <div className="flex gap-2">
        {(['rules', 'pantry', 'taste'] as const).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-lg font-medium capitalize ${
              tab === t ? 'bg-brand-500 text-white' : 'bg-gray-100 text-gray-600'
            }`}
          >
            {t === 'rules' ? '📏 Rules' : t === 'pantry' ? '🥫 Pantry' : '🧠 Taste'}
          </button>
        ))}
      </div>

      {tab === 'rules' && <RulesTab />}
      {tab === 'pantry' && <PantryTab />}
      {tab === 'taste' && <TasteTab currentUser={currentUser} users={users} />}
    </div>
  );
}

// ---------- Rules ----------
function RulesTab() {
  const [rules, setRules] = useState<any[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [newRule, setNewRule] = useState({ name: '', rule_type: 'protein_max_per_week', config: {} as any });

  useEffect(() => { getRules().then(setRules).catch(() => {}); }, []);

  const ruleTypes = [
    { value: 'protein_max_per_week', label: 'Protein Max Per Week', fields: ['protein', 'max', 'period_days'] },
    { value: 'protein_min_per_period', label: 'Protein Min Per Period', fields: ['protein', 'min', 'period_days'] },
    { value: 'no_repeat_within_days', label: 'No Repeat Within Days', fields: ['min_days_between_repeat'] },
    { value: 'min_tag_per_week', label: 'Min Tag Per Week', fields: ['tag', 'min', 'period_days'] },
  ];

  const handleAdd = async () => {
    await createRule(newRule);
    const updated = await getRules();
    setRules(updated);
    setShowAdd(false);
    setNewRule({ name: '', rule_type: 'protein_max_per_week', config: {} });
  };

  const handleToggle = async (rule: any) => {
    await updateRule(rule.id, { active: !rule.active });
    const updated = await getRules();
    setRules(updated);
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this rule?')) return;
    await deleteRule(id);
    setRules(rules.filter(r => r.id !== id));
  };

  return (
    <div className="space-y-3">
      <div className="flex justify-between items-center">
        <p className="text-sm text-gray-500">Rules the meal planner must follow.</p>
        <button onClick={() => setShowAdd(!showAdd)} className="btn-primary text-sm">+ Add Rule</button>
      </div>

      {showAdd && (
        <div className="card p-4 space-y-3">
          <input className="input" placeholder="Rule name" value={newRule.name} onChange={e => setNewRule({...newRule, name: e.target.value})} />
          <select className="input" value={newRule.rule_type} onChange={e => setNewRule({...newRule, rule_type: e.target.value, config: {}})}>
            {ruleTypes.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          {ruleTypes.find(t => t.value === newRule.rule_type)?.fields.map(field => (
            <input
              key={field}
              className="input"
              placeholder={field}
              value={newRule.config[field] || ''}
              onChange={e => setNewRule({...newRule, config: {...newRule.config, [field]: isNaN(Number(e.target.value)) ? e.target.value : Number(e.target.value) }})}
            />
          ))}
          <div className="flex gap-2">
            <button onClick={handleAdd} className="btn-primary text-sm">Save</button>
            <button onClick={() => setShowAdd(false)} className="btn-secondary text-sm">Cancel</button>
          </div>
        </div>
      )}

      {rules.map(rule => (
        <div key={rule.id} className={`card p-4 ${!rule.active ? 'opacity-50' : ''}`}>
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium">{rule.name}</div>
              <div className="text-sm text-gray-500">{rule.rule_type}: {JSON.stringify(rule.config)}</div>
            </div>
            <div className="flex gap-2">
              <button onClick={() => handleToggle(rule)} className="text-sm text-gray-500 hover:text-brand-500">
                {rule.active ? '✅ Active' : '⏸ Paused'}
              </button>
              <button onClick={() => handleDelete(rule.id)} className="text-sm text-red-400 hover:text-red-600">🗑</button>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

// ---------- Pantry ----------
function PantryTab() {
  const [staples, setStaples] = useState<any[]>([]);
  const [newName, setNewName] = useState('');

  useEffect(() => { getPantryStaples().then(setStaples).catch(() => {}); }, []);

  const handleAdd = async () => {
    if (!newName.trim()) return;
    const resp = await fetch(`/api/shopping/pantry/staples?name=${encodeURIComponent(newName)}`, { method: 'POST' });
    const item = await resp.json();
    setStaples([...staples, item]);
    setNewName('');
  };

  const handleRemove = async (id: number) => {
    await fetch(`/api/shopping/pantry/staples/${id}`, { method: 'DELETE' });
    setStaples(staples.filter(s => s.id !== id));
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-500">Items you always have — excluded from shopping lists.</p>

      <div className="flex gap-2">
        <input className="input flex-1" placeholder="Add a pantry staple..." value={newName} onChange={e => setNewName(e.target.value)} onKeyDown={e => e.key === 'Enter' && handleAdd()} />
        <button onClick={handleAdd} className="btn-primary">Add</button>
      </div>

      <div className="card divide-y divide-gray-50">
        {staples.map(s => (
          <div key={s.id} className="flex items-center justify-between px-4 py-2">
            <span>{s.name}</span>
            <button onClick={() => handleRemove(s.id)} className="text-red-400 hover:text-red-600 text-sm">✕</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Taste Profile ----------
function TasteTab({ currentUser, users }: { currentUser: any; users: any[] }) {
  const [profile, setProfile] = useState<any>(null);
  const [comparison, setComparison] = useState<any>(null);
  const [insights, setInsights] = useState<any>(null);
  const [loadingInsights, setLoadingInsights] = useState(false);

  useEffect(() => {
    if (currentUser) {
      getTasteProfile(currentUser.id).then(setProfile).catch(() => {});
    }
    compareTastes().then(setComparison).catch(() => {});
  }, [currentUser]);

  const handleGetInsights = async () => {
    if (!currentUser) return;
    setLoadingInsights(true);
    try {
      const data = await getTasteInsights(currentUser.id);
      setInsights(data.insights);
    } finally {
      setLoadingInsights(false);
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">Your taste profile, built from ratings and cooking history.</p>

      {profile?.preferences && Object.keys(profile.preferences).length > 0 ? (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">{currentUser?.name}&apos;s Taste Profile</h3>
          {Object.entries(profile.preferences).map(([dimension, values]: [string, any]) => (
            <div key={dimension} className="mb-4">
              <h4 className="text-sm font-medium text-gray-600 uppercase tracking-wide mb-2">{dimension}</h4>
              <div className="space-y-1">
                {Object.entries(values)
                  .sort(([,a]: any, [,b]: any) => b - a)
                  .map(([value, score]: [string, any]) => (
                    <div key={value} className="flex items-center gap-2">
                      <span className="text-sm w-24 truncate">{value}</span>
                      <div className="flex-1 h-3 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-brand-500 rounded-full"
                          style={{ width: `${Math.round(score * 100)}%` }}
                        />
                      </div>
                      <span className="text-xs text-gray-400 w-10 text-right">{Math.round(score * 100)}%</span>
                    </div>
                  ))}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="card p-6 text-center text-gray-500">
          <p>No taste data yet. Rate some recipes to build your profile!</p>
        </div>
      )}

      {/* AI Insights */}
      <div className="card p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold">🧠 AI Insights</h3>
          <button onClick={handleGetInsights} disabled={loadingInsights} className="btn-primary text-sm">
            {loadingInsights ? '🤔 Thinking...' : 'Generate Insights'}
          </button>
        </div>
        {insights && (
          <div className="space-y-2">
            {insights.map((insight: any, i: number) => (
              <div key={i} className="p-3 bg-brand-50 rounded-lg text-sm">
                {typeof insight === 'string' ? insight : insight.message}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Comparison */}
      {comparison?.agreements?.length > 0 && (
        <div className="card p-5">
          <h3 className="font-semibold mb-3">👫 You & Your Partner</h3>

          {comparison.agreements.length > 0 && (
            <div className="mb-4">
              <h4 className="text-sm font-medium text-green-600 mb-2">💚 You both love</h4>
              <div className="flex flex-wrap gap-2">
                {comparison.agreements.map((a: any, i: number) => (
                  <span key={i} className="badge bg-green-100 text-green-700">{a.value}</span>
                ))}
              </div>
            </div>
          )}

          {comparison.disagreements?.length > 0 && (
            <div>
              <h4 className="text-sm font-medium text-red-600 mb-2">🤷 You disagree on</h4>
              <div className="flex flex-wrap gap-2">
                {comparison.disagreements.map((d: any, i: number) => (
                  <span key={i} className="badge bg-red-100 text-red-700">{d.value}</span>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
