'use client';

import './globals.css';
import { useState, useEffect, createContext, useContext } from 'react';
import Link from 'next/link';
import { getUsers } from '@/lib/api';

interface UserContextType {
  currentUser: any | null;
  setCurrentUser: (user: any) => void;
  users: any[];
}

export const UserContext = createContext<UserContextType>({
  currentUser: null,
  setCurrentUser: () => {},
  users: [],
});

export function useUser() {
  return useContext(UserContext);
}

const NAV_ITEMS = [
  { href: '/', label: '🏠', title: 'Home' },
  { href: '/recipes', label: '📖', title: 'Recipes' },
  { href: '/recipes/import', label: '📥', title: 'Import' },
  { href: '/planner', label: '📅', title: 'Planner' },
  { href: '/swipe', label: '🔥', title: 'Swipe' },
  { href: '/shopping', label: '🛒', title: 'Shopping' },
  { href: '/settings', label: '⚙️', title: 'Settings' },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const [currentUser, setCurrentUser] = useState<any | null>(null);
  const [users, setUsers] = useState<any[]>([]);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    getUsers().then((u) => {
      setUsers(u);
      // Check cookie for saved user
      const saved = document.cookie.match(/dukecook_user=(\d+)/);
      if (saved) {
        const savedUser = u.find((x: any) => x.id === parseInt(saved[1]));
        if (savedUser) setCurrentUser(savedUser);
      }
    }).catch(console.error);
  }, []);

  const selectUser = (user: any) => {
    setCurrentUser(user);
    document.cookie = `dukecook_user=${user.id};path=/;max-age=31536000`;
  };

  // User selection screen
  if (!currentUser && users.length > 0) {
    return (
      <html lang="en">
        <head>
          <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
          <meta name="theme-color" content="#F97316" />
          <link rel="manifest" href="/manifest.json" />
          <title>DukeCook</title>
        </head>
        <body>
          <div className="min-h-screen flex items-center justify-center bg-brand-50">
            <div className="text-center">
              <h1 className="text-4xl font-bold text-brand-700 mb-2">🍳 DukeCook</h1>
              <p className="text-gray-500 mb-8">Who&apos;s cooking?</p>
              <div className="flex gap-6">
                {users.map((user) => (
                  <button
                    key={user.id}
                    onClick={() => selectUser(user)}
                    className="card p-8 hover:shadow-lg transition-shadow cursor-pointer"
                  >
                    <div className="text-5xl mb-3">{user.avatar_emoji}</div>
                    <div className="text-lg font-semibold text-gray-800">{user.name}</div>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </body>
      </html>
    );
  }

  return (
    <html lang="en">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#F97316" />
        <link rel="manifest" href="/manifest.json" />
        <title>DukeCook</title>
      </head>
      <body>
        <UserContext.Provider value={{ currentUser, setCurrentUser: selectUser, users }}>
          {/* Top nav bar */}
          <header className="bg-white border-b border-gray-200 sticky top-0 z-50">
            <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
              <Link href="/" className="flex items-center gap-2">
                <span className="text-2xl">🍳</span>
                <span className="font-bold text-brand-700 text-lg">DukeCook</span>
              </Link>

              {/* Desktop nav */}
              <nav className="hidden md:flex items-center gap-1">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="px-3 py-2 rounded-lg hover:bg-brand-50 text-gray-600 hover:text-brand-600 transition-colors text-sm font-medium"
                    title={item.title}
                  >
                    {item.label} {item.title}
                  </Link>
                ))}
              </nav>

              {/* User avatar */}
              <div className="flex items-center gap-3">
                {currentUser && (
                  <button
                    onClick={() => {
                      document.cookie = 'dukecook_user=;path=/;max-age=0';
                      setCurrentUser(null);
                    }}
                    className="text-2xl hover:scale-110 transition-transform"
                    title={`Signed in as ${currentUser.name}`}
                  >
                    {currentUser.avatar_emoji}
                  </button>
                )}
                {/* Mobile menu toggle */}
                <button
                  className="md:hidden text-gray-600 text-xl"
                  onClick={() => setMenuOpen(!menuOpen)}
                >
                  ☰
                </button>
              </div>
            </div>

            {/* Mobile nav */}
            {menuOpen && (
              <nav className="md:hidden border-t border-gray-100 bg-white pb-2">
                {NAV_ITEMS.map((item) => (
                  <Link
                    key={item.href}
                    href={item.href}
                    className="block px-4 py-2 text-gray-600 hover:bg-brand-50 hover:text-brand-600"
                    onClick={() => setMenuOpen(false)}
                  >
                    {item.label} {item.title}
                  </Link>
                ))}
              </nav>
            )}
          </header>

          <main className="max-w-5xl mx-auto px-4 py-6">
            {children}
          </main>
        </UserContext.Provider>
      </body>
    </html>
  );
}
