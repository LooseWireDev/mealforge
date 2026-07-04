import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/')({
  component: HomePage,
});

function HomePage(): React.ReactElement {
  return <p>mealforge</p>;
}
