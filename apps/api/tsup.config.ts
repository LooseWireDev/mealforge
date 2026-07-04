import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm'],
  // workspace packages ship as TS source — bundle them so dist runs on
  // plain node (locally and in the Docker image)
  noExternal: ['@mealforge/shared'],
});
