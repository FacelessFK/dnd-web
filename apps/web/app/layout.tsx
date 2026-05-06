import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'D&D DM-Driven Platform',
  description:
    'DM-authoritative runtime and developer cockpit for the D&D platform.',
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
