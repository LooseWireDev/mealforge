import { createFileRoute, redirect } from '@tanstack/react-router';

// The app's home is the meal plan section; keep `/` working for old
// bookmarks and the PWA start_url.
export const Route = createFileRoute('/')({
  beforeLoad: () => {
    throw redirect({ to: '/plans' });
  },
});
