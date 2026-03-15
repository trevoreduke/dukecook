'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type Locale = 'en' | 'es';

const translations: Record<string, Record<Locale, string>> = {
  // ── Layout / Nav ──
  'nav.home': { en: 'Home', es: 'Inicio' },
  'nav.dashboard': { en: 'Dashboard', es: 'Panel' },
  'nav.recipes': { en: 'Recipes', es: 'Recetas' },
  'nav.import': { en: 'Import', es: 'Importar' },
  'nav.planner': { en: 'Planner', es: 'Planificador' },
  'nav.swipe': { en: 'Swipe', es: 'Deslizar' },
  'nav.shopping': { en: 'Shopping', es: 'Compras' },
  'nav.settings': { en: 'Settings', es: 'Ajustes' },
  'nav.guide': { en: 'Guide', es: 'Guía' },
  'nav.menus': { en: 'Guest Menus', es: 'Menús de Invitados' },
  'who_cooking': { en: "Who's cooking?", es: '¿Quién cocina?' },
  'signed_in_as': { en: 'Signed in as', es: 'Conectado como' },

  // ── Home Page ──
  'home.welcome': { en: 'Welcome to DukeCook 🍳', es: 'Bienvenido a DukeCook 🍳' },
  'home.subtitle': { en: 'Your personal recipe & meal planning assistant', es: 'Tu asistente personal de recetas y planificación de comidas' },
  'home.recipes': { en: 'Recipes', es: 'Recetas' },
  'home.open_nights': { en: 'Open Nights', es: 'Noches Libres' },
  'home.ratings': { en: 'Ratings', es: 'Calificaciones' },
  'home.active_swipes': { en: 'Active Swipes', es: 'Deslizamientos' },
  'home.tonight': { en: "Tonight's Dinner", es: 'Cena de Esta Noche' },
  'home.no_dinner': { en: 'No dinner planned yet!', es: '¡Aún no hay cena planeada!' },
  'home.plan_something': { en: 'Plan Something', es: 'Planificar Algo' },
  'home.out_tonight': { en: "You're out tonight! 🎉", es: '¡Sales esta noche! 🎉' },
  'home.this_week': { en: 'This Week', es: 'Esta Semana' },
  'home.view_full_plan': { en: 'View Full Plan →', es: 'Ver Plan Completo →' },
  'home.rule_status': { en: 'Rule Status', es: 'Estado de Reglas' },
  'home.import_recipe': { en: 'Import Recipe', es: 'Importar Receta' },
  'home.swipe_together': { en: 'Swipe Together', es: 'Deslizar Juntos' },
  'home.plan_week': { en: 'Plan Week', es: 'Planificar Semana' },
  'home.shopping_list': { en: 'Shopping List', es: 'Lista de Compras' },
  'home.recent_recipes': { en: 'Recent Recipes', es: 'Recetas Recientes' },
  'home.view_all': { en: 'View All →', es: 'Ver Todo →' },
  'cook': { en: 'Cook →', es: 'Cocinar →' },

  // ── Recipe Detail ──
  'recipe.ingredients': { en: 'Ingredients', es: 'Ingredientes' },
  'recipe.steps': { en: 'Steps', es: 'Pasos' },
  'recipe.servings': { en: 'servings', es: 'porciones' },
  'recipe.prep': { en: 'Prep', es: 'Preparación' },
  'recipe.cook_time': { en: 'Cook', es: 'Cocción' },
  'recipe.total': { en: 'Total', es: 'Total' },
  'recipe.difficulty': { en: 'Difficulty', es: 'Dificultad' },
  'recipe.easy': { en: 'Easy', es: 'Fácil' },
  'recipe.medium': { en: 'Medium', es: 'Medio' },
  'recipe.hard': { en: 'Hard', es: 'Difícil' },
  'recipe.notes': { en: 'Notes', es: 'Notas' },
  'recipe.original': { en: 'Original', es: 'Original' },
  'recipe.formatted': { en: 'Formatted', es: 'Formateado' },
  'recipe.rate': { en: 'Rate', es: 'Calificar' },
  'recipe.edit': { en: 'Edit', es: 'Editar' },
  'recipe.cook_this': { en: '👨‍🍳 Cook This', es: '👨‍🍳 Cocinar Esto' },
  'recipe.plan_this': { en: '📅 Plan', es: '📅 Planificar' },
  'recipe.original_recipe': { en: 'Original Recipe', es: 'Receta Original' },
  'recipe.open_source': { en: 'Open source ↗', es: 'Ver fuente ↗' },
  'recipe.rate_recipe': { en: 'Rate This Recipe', es: 'Calificar Esta Receta' },
  'recipe.would_make_again': { en: 'Would make again', es: 'Lo haría de nuevo' },
  'recipe.add_notes': { en: 'Add notes...', es: 'Agregar notas...' },
  'recipe.submit_rating': { en: 'Submit Rating', es: 'Enviar Calificación' },
  'recipe.past_ratings': { en: 'Past Ratings', es: 'Calificaciones Anteriores' },
  'recipe.archive': { en: 'Archive', es: 'Archivar' },
  'recipe.unarchive': { en: 'Unarchive', es: 'Desarchivar' },
  'recipe.archived_msg': { en: 'This recipe is archived and hidden from your main list.', es: 'Esta receta está archivada y oculta de tu lista principal.' },
  'recipes.show_archived': { en: 'Show Archived', es: 'Ver Archivadas' },
  'recipes.hide_archived': { en: 'Hide Archived', es: 'Ocultar Archivadas' },

  // ── Whole Foods ──
  'wholefoods.title': { en: 'Whole Foods', es: 'Whole Foods' },
  'wholefoods.open': { en: 'Open Whole Foods', es: 'Abrir Whole Foods' },
  'wholefoods.desc': { en: 'Search each ingredient on Amazon Whole Foods for delivery', es: 'Busca cada ingrediente en Amazon Whole Foods para entrega' },

  // ── Kroger ──
  'kroger.title': { en: 'Kroger', es: 'Kroger' },
  'kroger.connected': { en: 'Connected', es: 'Conectado' },
  'kroger.connect_desc': { en: 'Connect your Kroger account to add ingredients to your cart with one tap.', es: 'Conecta tu cuenta de Kroger para agregar ingredientes a tu carrito con un toque.' },
  'kroger.connect_btn': { en: '🔗 Connect Kroger Account', es: '🔗 Conectar Cuenta Kroger' },
  'kroger.add_all': { en: '🛒 Add All to Kroger Cart', es: '🛒 Agregar Todo al Carrito' },
  'kroger.adding': { en: '⏳ Adding to cart...', es: '⏳ Agregando al carrito...' },
  'kroger.items': { en: 'items', es: 'artículos' },
  'kroger.open_cart': { en: '🛒 Open Kroger Cart', es: '🛒 Abrir Carrito Kroger' },
  'kroger.open_cart_short': { en: '🛒 Open Cart', es: '🛒 Abrir Carrito' },
  'kroger.not_found': { en: 'Not found', es: 'No encontrado' },
  'kroger.tap_item': { en: 'Tap any item to view on Kroger · Items also sent to your Kroger cart via API', es: 'Toca cualquier artículo para ver en Kroger · Los artículos también se envían a tu carrito' },
  'kroger.auto_match': { en: 'Auto-matches ingredients → adds to your Kroger cart for pickup/delivery', es: 'Busca ingredientes automáticamente → los agrega a tu carrito de Kroger' },

  // ── Recipes List ──
  'recipes.title': { en: 'Recipes', es: 'Recetas' },
  'recipes.search': { en: 'Search recipes...', es: 'Buscar recetas...' },
  'recipes.no_recipes': { en: 'No recipes yet!', es: '¡Aún no hay recetas!' },
  'recipes.import_first': { en: 'Import your first recipe to get started.', es: 'Importa tu primera receta para comenzar.' },

  // ── Import ──
  'import.title': { en: 'Import Recipe', es: 'Importar Receta' },
  'import.from_url': { en: 'From URL', es: 'Desde URL' },
  'import.from_photo': { en: 'From Photo', es: 'Desde Foto' },
  'import.paste_url': { en: 'Paste a recipe URL...', es: 'Pega una URL de receta...' },
  'import.importing': { en: 'Importing...', es: 'Importando...' },
  'import.import_btn': { en: 'Import', es: 'Importar' },
  'import.take_photo': { en: 'Take a photo or upload an image of a recipe', es: 'Toma una foto o sube una imagen de una receta' },
  'import.bulk': { en: 'Bulk Import', es: 'Importar en Lote' },
  'import.one_per_line': { en: 'One URL per line', es: 'Una URL por línea' },

  // ── Planner ──
  'planner.title': { en: 'Meal Planner', es: 'Planificador de Comidas' },
  'planner.this_week': { en: 'This Week', es: 'Esta Semana' },
  'planner.add_meal': { en: 'Add Meal', es: 'Agregar Comida' },
  'planner.suggest': { en: 'AI Suggest', es: 'Sugerencia IA' },
  'planner.available': { en: 'Available', es: 'Disponible' },
  'planner.busy': { en: 'Busy', es: 'Ocupado' },
  'planner.planned': { en: 'Planned', es: 'Planeado' },
  'planner.cooked': { en: 'Cooked', es: 'Cocinado' },
  'planner.skipped': { en: 'Skipped', es: 'Omitido' },

  // ── Shopping ──
  'shopping.title': { en: 'Shopping List', es: 'Lista de Compras' },
  'shopping.generate': { en: 'Generate from Plan', es: 'Generar del Plan' },
  'shopping.items_remaining': { en: 'items remaining', es: 'artículos restantes' },
  'shopping.all_done': { en: 'All done! 🎉', es: '¡Todo listo! 🎉' },
  'shopping.no_list': { en: 'No shopping list yet', es: 'Aún no hay lista de compras' },
  'shopping.shop_kroger': { en: 'Shop at Kroger', es: 'Comprar en Kroger' },

  // ── Swipe ──
  'swipe.title': { en: 'Swipe Night', es: 'Noche de Deslizar' },
  'swipe.start': { en: 'Start Swiping', es: 'Comenzar a Deslizar' },
  'swipe.its_a_match': { en: "It's a Match! 🎉", es: '¡Es un Match! 🎉' },
  'swipe.like': { en: 'Like', es: 'Me gusta' },
  'swipe.dislike': { en: 'Dislike', es: 'No me gusta' },
  'swipe.superlike': { en: 'Super Like', es: 'Super Like' },
  'swipe.skip': { en: 'Skip', es: 'Omitir' },

  // ── Cook Along ──
  'cookalong.title': { en: 'Cook Along', es: 'Cocinar Paso a Paso' },
  'cookalong.step': { en: 'Step', es: 'Paso' },
  'cookalong.of': { en: 'of', es: 'de' },
  'cookalong.prev': { en: 'Previous', es: 'Anterior' },
  'cookalong.next': { en: 'Next', es: 'Siguiente' },
  'cookalong.done': { en: 'Done! 🎉', es: '¡Listo! 🎉' },
  'cookalong.timer': { en: 'Timer', es: 'Temporizador' },

  // ── Settings ──
  'settings.title': { en: 'Settings', es: 'Ajustes' },
  'settings.dietary_rules': { en: 'Dietary Rules', es: 'Reglas Dietéticas' },
  'settings.pantry': { en: 'Pantry Staples', es: 'Despensa Básica' },
  'settings.taste': { en: 'Taste Profile', es: 'Perfil de Sabor' },

  // ── Common ──
  'loading': { en: 'Loading...', es: 'Cargando...' },
  'save': { en: 'Save', es: 'Guardar' },
  'cancel': { en: 'Cancel', es: 'Cancelar' },
  'delete': { en: 'Delete', es: 'Eliminar' },
  'back': { en: '← Back', es: '← Volver' },
  'min': { en: 'min', es: 'min' },
  'yes': { en: 'Yes', es: 'Sí' },
  'no': { en: 'No', es: 'No' },

  // ── Day names ──
  'day.Mon': { en: 'Mon', es: 'Lun' },
  'day.Tue': { en: 'Tue', es: 'Mar' },
  'day.Wed': { en: 'Wed', es: 'Mié' },
  'day.Thu': { en: 'Thu', es: 'Jue' },
  'day.Fri': { en: 'Fri', es: 'Vie' },
  'day.Sat': { en: 'Sat', es: 'Sáb' },
  'day.Sun': { en: 'Sun', es: 'Dom' },
  'day.Monday': { en: 'Monday', es: 'Lunes' },
  'day.Tuesday': { en: 'Tuesday', es: 'Martes' },
  'day.Wednesday': { en: 'Wednesday', es: 'Miércoles' },
  'day.Thursday': { en: 'Thursday', es: 'Jueves' },
  'day.Friday': { en: 'Friday', es: 'Viernes' },
  'day.Saturday': { en: 'Saturday', es: 'Sábado' },
  'day.Sunday': { en: 'Sunday', es: 'Domingo' },
};

interface I18nContextType {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextType>({
  locale: 'en',
  setLocale: () => {},
  t: (key: string, fallback?: string) => fallback || key,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('en');

  useEffect(() => {
    const saved = document.cookie.match(/dukecook_lang=(\w+)/);
    if (saved && (saved[1] === 'en' || saved[1] === 'es')) {
      setLocaleState(saved[1] as Locale);
    }
  }, []);

  const setLocale = (l: Locale) => {
    setLocaleState(l);
    document.cookie = `dukecook_lang=${l};path=/;max-age=31536000`;
  };

  const t = (key: string, fallback?: string): string => {
    return translations[key]?.[locale] || fallback || key;
  };

  return (
    <I18nContext.Provider value={{ locale, setLocale, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  return useContext(I18nContext);
}

export function LanguageToggle() {
  const { locale, setLocale } = useI18n();

  return (
    <button
      onClick={() => setLocale(locale === 'en' ? 'es' : 'en')}
      className="text-xl hover:scale-110 transition-transform"
      title={locale === 'en' ? 'Cambiar a Español' : 'Switch to English'}
    >
      {locale === 'en' ? '🇺🇸' : '🇪🇨'}
    </button>
  );
}
