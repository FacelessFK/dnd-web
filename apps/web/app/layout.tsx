import type { Metadata } from 'next';
import { I18nProvider } from '../lib/i18n';
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
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
