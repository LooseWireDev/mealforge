import { createRootRoute, Outlet, Link } from '@tanstack/react-router';

export const Route = createRootRoute({
  component: RootLayout,
});

function RootLayout(): React.ReactElement {
  return (
    <div>
      <nav>
        <Link to="/">Home</Link>
      </nav>
      <main>
        <Outlet />
      </main>
    </div>
  );
}
