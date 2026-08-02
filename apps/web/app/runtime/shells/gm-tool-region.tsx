'use client';

/**
 * The GM's tools, one group at a time.
 *
 * A tab list rather than a stack, because the old surface put every tool on
 * screen at once and the result was a page you scrolled rather than a table you
 * ran. Only the selected group renders, so the map keeps the screen and the GM
 * chooses what to bring into it.
 *
 * Diagnostics are a tab like any other and are never the one you land on. They
 * stay reachable for whoever is debugging a live table, and stay out of the way
 * of whoever is running one.
 */
import type { ReactNode, RefObject } from 'react';

import {
  gameMasterToolTabs,
  type GameMasterToolTab,
} from '../../../lib/runtime-hud-layout';
import type { RuntimeTranslator } from '../../../lib/runtime-localization';

const tabLabelKeys = {
  combatants: 'runtime.gmTools.tab.combatants',
  diagnostics: 'runtime.gmTools.tab.diagnostics',
  roster: 'runtime.gmTools.tab.roster',
  scene: 'runtime.gmTools.tab.scene',
  table: 'runtime.gmTools.tab.table',
} as const;

export type GmToolRegionProps = {
  activeTab: GameMasterToolTab;
  children: ReactNode;
  onSelectTab: (tab: GameMasterToolTab) => void;
  t: RuntimeTranslator;
  tabRefs?: RefObject<Record<string, HTMLButtonElement | null>>;
};

export function GmToolRegion({
  activeTab,
  children,
  onSelectTab,
  t,
}: GmToolRegionProps) {
  return (
    <div className="grid gap-3" data-hud-region="gm-tools">
      <div
        aria-label={t('runtime.gmTools.title')}
        className="flex flex-wrap gap-2"
        role="tablist"
      >
        {gameMasterToolTabs.map((tab) => {
          const selected = tab === activeTab;

          return (
            <button
              aria-controls={`gm-tool-panel-${tab}`}
              aria-selected={selected}
              className={`min-h-10 rounded-xl border px-3 py-2 text-xs font-black uppercase tracking-[0.12em] transition focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-200 ${
                selected
                  ? 'border-amber-300 bg-amber-300 text-stone-950'
                  : 'border-amber-400/20 bg-black/25 text-amber-100/75 hover:border-amber-300/50 hover:text-amber-50'
              }`}
              data-testid={`gm-tool-tab-${tab}`}
              id={`gm-tool-tab-${tab}`}
              key={tab}
              onClick={() => onSelectTab(tab)}
              role="tab"
              type="button"
            >
              {t(tabLabelKeys[tab])}
            </button>
          );
        })}
      </div>

      <div
        aria-labelledby={`gm-tool-tab-${activeTab}`}
        className="grid gap-4"
        id={`gm-tool-panel-${activeTab}`}
        role="tabpanel"
        tabIndex={0}
      >
        {children}
      </div>
    </div>
  );
}
