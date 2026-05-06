import type { Metadata } from 'next';

import { RuntimeCockpit } from './runtime-cockpit';

export const metadata: Metadata = {
  title: 'Runtime Cockpit | D&D DM-Driven Platform',
  description:
    'Developer-facing cockpit for manually operating the authoritative runtime.',
};

export default function RuntimePage() {
  return <RuntimeCockpit />;
}
