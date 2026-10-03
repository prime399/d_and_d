import { loadContent } from '@/game/content/loader';
import { GameShell } from '@/components/GameShell';

// Content is fetched from Sanity on the server (GROQ), so no tokens or CORS in the browser.
export const revalidate = 60;

export default async function Home() {
  const content = await loadContent();
  return <GameShell content={content} />;
}
