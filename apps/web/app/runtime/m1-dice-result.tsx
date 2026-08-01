'use client';

/**
 * The server's audit record, rendered.
 *
 * Every number here came from `diceResolution`. The component decides layout
 * and nothing else - it does not compare a total to a DC, does not pick which
 * die counted, and does not derive a modifier. All of that arrives already
 * decided, via `describeDiceResolution`, which is what makes this safe to show
 * to either role.
 */
import type { DiceResolution } from '@dnd/protocol';

import { useI18n, type MessageKey } from '../../lib/i18n';
import {
  describeDiceResolution,
  type LocalizedDescriptor,
} from '../../lib/m1-resolution-view';

type M1DiceResultProps = {
  resolution: DiceResolution;
};

export function M1DiceResult({ resolution }: M1DiceResultProps) {
  const { t } = useI18n();
  const view = describeDiceResolution(resolution);
  const describe = (descriptor: LocalizedDescriptor): string =>
    t(
      descriptor.key,
      Object.fromEntries(
        Object.entries(descriptor.values ?? {}).map(([name, value]) => [
          name,
          value.startsWith('runtime.m1.') ? t(value as MessageKey) : value,
        ]),
      ),
    );

  return (
    <article
      className="rounded-2xl border border-amber-500/25 bg-black/30 p-3 text-sm"
      data-testid="m1-dice-result"
      data-resolution-kind={resolution.kind}
      data-outcome={
        resolution.success === undefined
          ? 'none'
          : resolution.success
            ? 'success'
            : 'failure'
      }
    >
      <header className="flex flex-wrap items-baseline gap-2">
        <h4 className="font-black text-amber-100">{t(view.kindKey)}</h4>
        <span className="text-amber-200/80">{t(view.abilityKey)}</span>
        {view.skillKey ? (
          <span className="text-amber-200/80">· {t(view.skillKey)}</span>
        ) : null}
        {view.outcomeKey ? (
          <span
            className="ms-auto rounded-full border border-amber-400/40 px-2 py-0.5 font-bold text-amber-50"
            data-testid="m1-dice-outcome"
          >
            {t(view.outcomeKey)}
          </span>
        ) : null}
      </header>

      <dl className="mt-2 grid gap-1">
        <div className="flex flex-wrap items-center gap-2">
          <dt className="text-amber-200/70">{t('runtime.m1.result.dice')}</dt>
          {/* `dir="ltr"` on the dice and on every signed number: Persian is an
              RTL page, but `+3` and a die sequence read left to right in both
              locales, and letting them flip makes a modifier unreadable. */}
          <dd className="flex gap-1" dir="ltr" data-testid="m1-dice-faces">
            {view.dice.map((die, index) => (
              <span
                key={`${die.face}-${index}`}
                className={
                  die.selected
                    ? 'rounded-md bg-amber-400/25 px-2 font-black text-amber-50'
                    : 'rounded-md px-2 text-amber-200/50 line-through'
                }
                data-selected={die.selected ? 'true' : 'false'}
              >
                {die.face}
              </span>
            ))}
          </dd>
          <dd className="text-amber-200/70">
            {t('runtime.m1.result.selected')} {view.selectedDie}
          </dd>
          <dd className="text-amber-200/70">{t(view.stanceKey)}</dd>
        </div>

        {view.stanceSources.length ? (
          <div>
            <dt className="text-amber-200/70">{t('runtime.m1.result.why')}</dt>
            <dd data-testid="m1-stance-sources">
              <ul className="list-none">
                {view.stanceSources.map((source, index) => (
                  <li key={`${source.key}-${index}`} className="text-amber-100">
                    {describe(source)}
                  </li>
                ))}
              </ul>
            </dd>
          </div>
        ) : null}

        <div>
          <dt className="text-amber-200/70">
            {t('runtime.m1.result.modifiers')}
          </dt>
          <dd data-testid="m1-modifiers">
            <ul className="list-none">
              {view.modifiers.map((modifier, index) => (
                <li
                  key={`${modifier.key}-${index}`}
                  className="flex items-baseline gap-2 text-amber-100"
                  data-modifier-kind={
                    modifier.key.includes('proficiency')
                      ? 'proficiency'
                      : 'other'
                  }
                >
                  <span>{describe(modifier)}</span>
                  <span dir="ltr" className="font-mono">
                    {modifier.signedValue}
                  </span>
                </li>
              ))}
            </ul>
          </dd>
        </div>

        <div className="flex flex-wrap items-baseline gap-3 border-t border-amber-500/20 pt-1">
          <dt className="text-amber-200/70">{t('runtime.m1.result.total')}</dt>
          <dd
            className="font-black text-amber-50"
            dir="ltr"
            data-testid="m1-dice-total"
          >
            {view.total}
          </dd>
          {view.thresholdKey && view.thresholdValue !== null ? (
            <dd className="text-amber-200/80" dir="ltr">
              {t(view.thresholdKey)} {view.thresholdValue}
            </dd>
          ) : null}
        </div>
      </dl>
    </article>
  );
}
