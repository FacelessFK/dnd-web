import type { Metadata } from 'next';
import { I18nProvider } from '../lib/i18n';
import './globals.css';

export const metadata: Metadata = {
  title: 'پلتفرم D&D با هدایت DM',
  description:
    'میز اجرای معتبر با کنترل DM و کابین توسعه برای پلتفرم D&D.',
};

type RootLayoutProps = {
  children: React.ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html dir="rtl" lang="fa">
      <body>
        <I18nProvider>{children}</I18nProvider>
      </body>
    </html>
  );
}
