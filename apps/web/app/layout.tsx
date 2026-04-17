import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'D&D DM-Driven Platform',
  description:
    'Phase 0 workspace foundation for the DM-authoritative platform.',
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
