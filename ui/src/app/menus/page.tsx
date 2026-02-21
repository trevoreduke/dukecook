'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getGuestMenus, updateGuestMenu, deleteGuestMenu } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function MenusPage() {
  const [menus, setMenus] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const { t } = useI18n();

  const loadMenus = () => {
    setLoading(true);
    getGuestMenus()
      .then(setMenus)
      .catch(() => [])
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadMenus(); }, []);

  const toggleActive = async (menu: any) => {
    await updateGuestMenu(menu.id, { active: !menu.active });
    loadMenus();
  };

  const handleDelete = async (menu: any) => {
    if (!confirm(`Delete "${menu.title}"? This removes all votes too.`)) return;
    await deleteGuestMenu(menu.id);
    loadMenus();
  };

  const copyLink = (slug: string) => {
    const url = `${window.location.origin}/m/${slug}`;
    navigator.clipboard.writeText(url);
    alert('Link copied!');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">🎉 {t('nav.menus')}</h1>
        <Link href="/menus/create" className="btn-primary">+ Create Menu</Link>
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-400">Loading menus...</div>
      ) : menus.length === 0 ? (
        <div className="card p-8 text-center">
          <div className="text-4xl mb-3">🎉</div>
          <h3 className="text-lg font-medium mb-2">No guest menus yet!</h3>
          <p className="text-gray-500 mb-4">Create a themed menu to share with your dinner guests.</p>
          <Link href="/menus/create" className="btn-primary">Create Your First Menu</Link>
        </div>
      ) : (
        <div className="space-y-3">
          {menus.map((menu) => (
            <div key={menu.id} className="card p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Link href={`/menus/${menu.id}`} className="font-semibold text-lg hover:text-brand-600 truncate">
                      {menu.title}
                    </Link>
                    <span className={`badge text-xs ${menu.active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {menu.active ? 'Active' : 'Inactive'}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-sm text-gray-500">
                    <span className="font-mono text-xs bg-gray-100 px-2 py-0.5 rounded">/m/{menu.slug}</span>
                    <span>{menu.item_count} recipes</span>
                    <span>{menu.vote_count} votes</span>
                    <span>{menu.guest_count} guests</span>
                  </div>
                </div>

                <div className="flex items-center gap-2 flex-shrink-0">
                  <Link href={`/menus/${menu.id}`} className="px-3 py-1.5 text-sm rounded-lg bg-brand-50 text-brand-600 hover:bg-brand-100">
                    Results
                  </Link>
                  <button
                    onClick={() => copyLink(menu.slug)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-blue-50 text-blue-600 hover:bg-blue-100"
                  >
                    Copy Link
                  </button>
                  <button
                    onClick={() => toggleActive(menu)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-gray-50 text-gray-600 hover:bg-gray-100"
                  >
                    {menu.active ? 'Deactivate' : 'Activate'}
                  </button>
                  <button
                    onClick={() => handleDelete(menu)}
                    className="px-3 py-1.5 text-sm rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
