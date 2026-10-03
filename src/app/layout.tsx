import type { Metadata } from 'next';
import { Inter, MedievalSharp, Pixelify_Sans } from 'next/font/google';
import './globals.css';

const medieval = MedievalSharp({ weight: '400', subsets: ['latin'], variable: '--font-medieval' });
const pixelify = Pixelify_Sans({ subsets: ['latin'], variable: '--font-pixelify' });
const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'The Goblin Warren · an AI Dungeon Master that cites the rules',
  description: 'A turn-based D&D 5e dungeon crawl in your browser. The Dungeon Master looks up every ruling in Sanity Context and shows its sources.',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${medieval.variable} ${pixelify.variable} ${inter.variable}`}>
      <body className="antialiased">{children}</body>
    </html>
  );
}
