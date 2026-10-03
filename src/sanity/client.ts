// Server-side Sanity client. Returns null when the project isn't configured.
import { createClient, type SanityClient } from '@sanity/client';

export const SANITY_API_VERSION = '2026-09-01';

export function getSanityClient(): SanityClient | null {
  const projectId = process.env.SANITY_PROJECT_ID;
  const dataset = process.env.SANITY_DATASET;
  if (!projectId || !dataset) return null;
  const token = process.env.SANITY_READ_TOKEN || undefined;
  return createClient({
    projectId,
    dataset,
    apiVersion: SANITY_API_VERSION,
    // Tokens can't be used with the CDN; private datasets need the token.
    useCdn: !token,
    token,
    perspective: 'published',
  });
}
