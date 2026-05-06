import type { Metadata } from 'next';

import { RuntimeCockpit } from './runtime-cockpit';

export const metadata: Metadata = {
  title: 'Runtime | D&D DM-Driven Platform',
  description:
    'Role-aware browser surface for operating the authoritative runtime.',
};

export default function RuntimePage() {
  return <RuntimeCockpit />;
}
