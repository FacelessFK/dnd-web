import type { Metadata } from 'next';

import { MapBuilder } from './map-builder';

export const metadata: Metadata = {
  title: 'Map Builder | D&D DM-Driven Platform',
  description:
    'Paint terrain, place props, and publish playable maps to a runtime session.',
};

export default function MapsPage() {
  return <MapBuilder />;
}
