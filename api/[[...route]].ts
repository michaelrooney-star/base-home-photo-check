import { handle } from 'hono/vercel';
import { createApp } from '../server/app';

export const runtime = 'edge';
export const preferredRegion = 'iad1';

const app = createApp();

// Only handle /api/ops/* and /api/admin/*; 404 others under /api/*
export default handle(app);
