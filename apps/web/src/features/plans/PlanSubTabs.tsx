import { Link } from '@tanstack/react-router';

const SUB_TABS = [
  { to: '/plans', label: 'Active', exact: true },
  { to: '/plans/upcoming', label: 'Upcoming', exact: false },
  { to: '/plans/completed', label: 'Completed', exact: false },
  { to: '/plans/favorites', label: 'Favorites', exact: false },
] as const;

export function PlanSubTabs(): React.ReactElement {
  return (
    <nav aria-label="Meal plan lists" className="flex rounded-xl border border-line bg-card p-1">
      {SUB_TABS.map((tab) => (
        <Link
          key={tab.to}
          to={tab.to}
          activeOptions={{ exact: tab.exact }}
          className="flex-1 rounded-lg py-2 text-center text-xs font-semibold transition-colors"
          activeProps={{ className: 'bg-leaf text-paper' }}
          inactiveProps={{ className: 'text-ink-soft' }}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
