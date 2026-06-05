'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import type { CharacterLibraryEntry } from '@dnd/protocol';

import {
  buildCharacterSheetPreviewModel,
  generateCharacterSheetPdf,
  recordCharacterSheetPdfSmokeArtifact,
  type CharacterSheetPdfResult,
  type CharacterSheetPreviewField,
  type CharacterSheetTemplateId,
} from '../../lib/character-sheet-pdf';
import { useI18n } from '../../lib/i18n';

type CharacterSheetPdfPreviewProps = {
  entry: CharacterLibraryEntry;
  onClose: () => void;
  onNotice: (notice: string) => void;
  templateId: CharacterSheetTemplateId;
};

export function CharacterSheetPdfPreview({
  entry,
  onClose,
  onNotice,
  templateId,
}: CharacterSheetPdfPreviewProps) {
  const { t } = useI18n();
  const preview = useMemo(
    () => buildCharacterSheetPreviewModel(entry, templateId),
    [entry, templateId],
  );
  const [pdfResult, setPdfResult] = useState<CharacterSheetPdfResult | null>(
    null,
  );
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let nextUrl: string | null = null;

    setPdfResult(null);
    setPdfUrl(null);
    setError(null);

    async function preparePdf(): Promise<void> {
      try {
        const result = await generateCharacterSheetPdf(entry, { templateId });
        const blob = new Blob([result.bytes], { type: 'application/pdf' });

        nextUrl = URL.createObjectURL(blob);
        recordCharacterSheetPdfSmokeArtifact(result);

        if (!active) {
          URL.revokeObjectURL(nextUrl);
          nextUrl = null;
          return;
        }

        setPdfResult(result);
        setPdfUrl(nextUrl);
        onNotice(
          result.fallbackReason
            ? t('page.characterLibrary.pdfPreviewFallbackReady', {
                reason: result.fallbackReason,
              })
            : t('page.characterLibrary.pdfPreviewReady', {
                template: result.template.label,
              }),
        );
      } catch (caughtError) {
        if (!active) {
          return;
        }

        setError(
          caughtError instanceof Error
            ? caughtError.message
            : t('page.characterLibrary.pdfPreviewUnknownError'),
        );
      }
    }

    void preparePdf();

    return () => {
      active = false;

      if (nextUrl) {
        URL.revokeObjectURL(nextUrl);
      }
    };
  }, [entry, onNotice, t, templateId]);

  const downloadPreparedPdf = (): void => {
    if (!pdfResult || !pdfUrl) {
      return;
    }

    const anchor = document.createElement('a');

    anchor.href = pdfUrl;
    anchor.download = pdfResult.fileName;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    onNotice(
      pdfResult.fallbackReason
        ? t('page.characterLibrary.pdfFallbackSuccess', {
            reason: pdfResult.fallbackReason,
          })
        : t('page.characterLibrary.pdfSuccess', {
            template: pdfResult.template.label,
          }),
    );
  };

  const visibleSpellcasting = preview.spellcasting.filter(
    (field) => field.value && field.value !== 'None',
  );

  return (
    <div
      aria-label={t('page.characterLibrary.pdfPreviewTitle')}
      aria-modal="true"
      className="fixed inset-0 z-50 overflow-y-auto bg-black/75 px-4 py-6 backdrop-blur-sm"
      role="dialog"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-4">
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--color-border)] bg-[var(--color-surface)] p-4 shadow-2xl shadow-black/40">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.2em] text-[var(--color-text-muted)]">
              {t('page.characterLibrary.pdfPreviewEyebrow')}
            </p>
            <h2 className="text-xl font-black text-[var(--color-text)]">
              {t('page.characterLibrary.pdfPreviewTitle')}
            </h2>
          </div>
          <div className="ml-auto flex flex-wrap gap-2">
            <button
              className="rounded-xl border border-[var(--color-border)] px-4 py-2 text-sm font-bold text-[var(--color-text)] transition hover:border-[var(--color-gold)]"
              onClick={onClose}
              type="button"
            >
              {t('page.characterLibrary.pdfPreviewClose')}
            </button>
            <button
              className="rounded-xl border border-amber-300/45 bg-amber-400 px-4 py-2 text-sm font-black text-slate-950 transition hover:bg-amber-300 disabled:cursor-not-allowed disabled:opacity-45"
              disabled={!pdfResult || !pdfUrl}
              onClick={downloadPreparedPdf}
              type="button"
            >
              {pdfResult
                ? t('page.characterLibrary.pdfPreviewDownload')
                : t('page.characterLibrary.pdfPending')}
            </button>
          </div>
        </div>

        {error ? (
          <p className="rounded-2xl border border-red-300/30 bg-red-950/40 p-4 text-sm font-bold text-red-100">
            {t('page.characterLibrary.pdfPreviewFailed', { reason: error })}
          </p>
        ) : null}

        {pdfResult?.fallbackReason ? (
          <p className="rounded-2xl border border-amber-300/20 bg-amber-950/35 p-4 text-sm font-bold text-amber-100">
            {t('page.characterLibrary.pdfPreviewFallback', {
              reason: pdfResult.fallbackReason,
            })}
          </p>
        ) : null}

        <section
          className="mx-auto w-full max-w-[960px] bg-[#f9f5ea] p-5 text-[#17120c] shadow-2xl shadow-black/50 sm:p-8"
          dir="ltr"
        >
          <div className="min-h-[1240px] border-[3px] border-[#17120c] p-4">
            <div className="grid gap-3 border-b-[3px] border-[#17120c] pb-4 md:grid-cols-[1.3fr_2fr]">
              <div className="rounded-[2rem] border-[3px] border-[#17120c] p-4">
                <p className="text-[10px] font-black uppercase tracking-[0.24em]">
                  Dungeons & Dragons
                </p>
                <h1 className="mt-3 break-words text-3xl font-black">
                  {preview.title}
                </h1>
                <p className="mt-2 text-sm font-bold">
                  {preview.profileLabel} / {preview.templateEra}
                </p>
              </div>
              <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
                {preview.identity.map((field) => (
                  <PreviewBox field={field} key={field.label} />
                ))}
              </div>
            </div>

            <div className="mt-4 grid gap-4 lg:grid-cols-[9rem_1fr_1fr]">
              <div className="grid gap-3">
                {preview.abilities.map((ability) => (
                  <div
                    className="rounded-[1.8rem] border-[3px] border-[#17120c] p-3 text-center"
                    key={ability.key}
                  >
                    <p className="text-xs font-black tracking-[0.18em]">
                      {ability.label}
                    </p>
                    <p className="mt-2 text-4xl font-black">{ability.score}</p>
                    <p className="mx-auto mt-2 w-fit rounded-full border-2 border-[#17120c] px-4 py-1 text-lg font-black">
                      {ability.modifier}
                    </p>
                    <p className="mt-2 text-[10px] font-bold uppercase tracking-[0.14em]">
                      Save {ability.savingThrow}
                    </p>
                  </div>
                ))}
              </div>

              <div className="grid content-start gap-4">
                <PreviewPanel title="Combat">
                  <div className="grid grid-cols-2 gap-2">
                    {preview.combat.map((field) => (
                      <PreviewBox field={field} key={field.label} />
                    ))}
                  </div>
                </PreviewPanel>

                <PreviewPanel title="Skills">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                    {preview.skills.map((field) => (
                      <div
                        className="flex justify-between gap-3"
                        key={field.label}
                      >
                        <span>{field.label}</span>
                        <strong>{field.value}</strong>
                      </div>
                    ))}
                  </div>
                </PreviewPanel>

                <PreviewPanel title="Equipment">
                  <PreviewList items={preview.equipment} />
                </PreviewPanel>
              </div>

              <div className="grid content-start gap-4">
                <PreviewPanel title="Features & Traits">
                  <p className="min-h-24 whitespace-pre-line text-xs leading-5">
                    {preview.notes || '-'}
                  </p>
                </PreviewPanel>

                <PreviewPanel title="Spellcasting">
                  {visibleSpellcasting.length > 0 ? (
                    <div className="grid gap-2">
                      {visibleSpellcasting.map((field) => (
                        <PreviewBox field={field} key={field.label} />
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs font-bold">None</p>
                  )}
                </PreviewPanel>

                <PreviewPanel title="Notes">
                  <p className="min-h-40 whitespace-pre-line text-xs leading-5">
                    {preview.notes || '-'}
                  </p>
                </PreviewPanel>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

function PreviewBox({ field }: { field: CharacterSheetPreviewField }) {
  return (
    <div className="min-h-16 rounded-2xl border-2 border-[#17120c] p-2">
      <p className="text-[9px] font-black uppercase tracking-[0.16em]">
        {field.label}
      </p>
      <p className="mt-1 break-words text-sm font-black">
        {field.value || '-'}
      </p>
    </div>
  );
}

function PreviewList({ items }: { items: string[] }) {
  if (items.length === 0) {
    return <p className="text-xs font-bold">None</p>;
  }

  return (
    <ul className="grid gap-1 text-xs font-bold">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function PreviewPanel({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <section className="rounded-3xl border-[3px] border-[#17120c] p-3">
      <h3 className="mb-3 border-b-2 border-[#17120c] pb-1 text-sm font-black uppercase tracking-[0.18em]">
        {title}
      </h3>
      {children}
    </section>
  );
}
