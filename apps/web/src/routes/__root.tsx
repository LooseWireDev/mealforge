import { createRootRoute, Link, Outlet } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

const TABS = [
  {
    to: '/',
    label: 'This Week',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-6"
        aria-hidden="true"
      >
        <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
        <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      </svg>
    ),
  },
  {
    to: '/recipes',
    label: 'Recipes',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-6"
        aria-hidden="true"
      >
        <path d="M5 4.5A2.5 2.5 0 0 1 7.5 2H19v17.5H7.5A2.5 2.5 0 0 0 5 22z" />
        <path d="M5 19.5A2.5 2.5 0 0 1 7.5 17H19M9 6.5h6" />
      </svg>
    ),
  },
  {
    to: '/grocery',
    label: 'Grocery',
    icon: (
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.8"
        className="size-6"
        aria-hidden="true"
      >
        <path d="M4 7.5h16l-1.6 11a2 2 0 0 1-2 1.7H7.6a2 2 0 0 1-2-1.7z" />
        <path d="M8.5 10.5V6a3.5 3.5 0 0 1 7 0v4.5" />
      </svg>
    ),
  },
] as const;

function RootLayout(): React.ReactElement {
  return (
    <div className="mx-auto flex min-h-dvh max-w-2xl flex-col">
      <main className="flex-1 pb-24">
        <Outlet />
      </main>
      <nav
        aria-label="Main"
        className="fixed inset-x-0 bottom-0 border-t border-line bg-card pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-2xl">
          {TABS.map((tab) => (
            <Link
              key={tab.to}
              to={tab.to}
              className="flex flex-1 flex-col items-center gap-0.5 py-2.5 text-[0.7rem] font-medium text-ink-soft"
              activeProps={{ className: 'text-leaf-deep' }}
              activeOptions={{ exact: tab.to === '/' }}
            >
              {tab.icon}
              {tab.label}
            </Link>
          ))}
        </div>
      </nav>
    </div>
  );
}
