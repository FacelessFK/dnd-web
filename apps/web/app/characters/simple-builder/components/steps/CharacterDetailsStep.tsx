import { useRef, useState } from 'react';
import { useBuilderI18n } from '../../localization';
import { useCharacterStore } from '../../store/characterStore';
import type { Alignment } from '../../types';

const ALIGNMENTS: { short: string; value: Alignment }[] = [
  { value: 'Lawful Good', short: 'LG' },
  { value: 'Neutral Good', short: 'NG' },
  { value: 'Chaotic Good', short: 'CG' },
  { value: 'Lawful Neutral', short: 'LN' },
  { value: 'True Neutral', short: 'TN' },
  { value: 'Chaotic Neutral', short: 'CN' },
  { value: 'Lawful Evil', short: 'LE' },
  { value: 'Neutral Evil', short: 'NE' },
  { value: 'Chaotic Evil', short: 'CE' },
];

function Field({
  children,
  label,
  required,
}: {
  children: React.ReactNode;
  label: string;
  required?: boolean;
}) {
  return (
    <div>
      <label
        className="mb-1.5 block text-xs font-semibold tracking-wide"
        style={{ color: 'var(--color-text-muted)' }}
      >
        {label}{' '}
        {required ? (
          <span style={{ color: 'var(--color-error)' }}>*</span>
        ) : null}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  background: 'var(--color-surface)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
};

export function CharacterDetailsStep() {
  const {
    age,
    alignment,
    backstory,
    height,
    name,
    portraitDataUrl,
    pronouns,
    setAge,
    setAlignment,
    setBackstory,
    setHeight,
    setName,
    setPortraitDataUrl,
    setPronouns,
    setWeight,
    weight,
  } = useCharacterStore();
  const { alignment: alignmentLabel, copy, isFa } = useBuilderI18n();
  const [dragging, setDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const readPortraitFile = (file: File | undefined) => {
    if (!file || !file.type.startsWith('image/')) return;

    const reader = new FileReader();
    reader.addEventListener('load', () => {
      setPortraitDataUrl(typeof reader.result === 'string' ? reader.result : '');
    });
    reader.readAsDataURL(file);
  };

  return (
    <div>
      <div className="mb-6">
        <h2
          className="mb-1 text-2xl font-bold"
          style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}
        >
          {copy.detailsTitle}
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          {copy.detailsDescription}
        </p>
      </div>

      <div className="max-w-xl space-y-5">
        <Field label={isFa ? 'تصویر کاراکتر' : 'Character Portrait'}>
          <div
            className="grid gap-3 rounded-xl border p-3 sm:grid-cols-[8rem_1fr]"
            onDragLeave={() => setDragging(false)}
            onDragOver={(event) => {
              event.preventDefault();
              setDragging(true);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              readPortraitFile(event.dataTransfer.files[0]);
            }}
            style={{
              background: dragging
                ? 'var(--color-gold-dim)'
                : 'var(--color-surface)',
              borderColor: dragging
                ? 'var(--color-gold)'
                : 'var(--color-border)',
            }}
          >
            <div
              className="flex aspect-square items-center justify-center overflow-hidden rounded-xl border"
              style={{
                background: 'var(--color-surface-elevated)',
                borderColor: 'var(--color-border)',
              }}
            >
              {portraitDataUrl ? (
                <img
                  alt="پیش‌نمایش پرتره کاراکتر"
                  className="h-full w-full object-cover object-top"
                  src={portraitDataUrl}
                />
              ) : (
                <span
                  className="text-3xl font-bold"
                  style={{ color: 'var(--color-gold)' }}
                >
                  D20
                </span>
              )}
            </div>
            <div className="flex flex-col justify-center gap-2">
              <input
                accept="image/*"
                className="hidden"
                onChange={(event) => readPortraitFile(event.target.files?.[0])}
                ref={fileInputRef}
                type="file"
              />
              <button
                className="w-fit rounded-lg border px-4 py-2 text-sm font-medium transition-colors hover:border-[var(--color-gold)] hover:text-[var(--color-gold)]"
                onClick={() => fileInputRef.current?.click()}
                style={{
                  borderColor: 'var(--color-border)',
                  color: 'var(--color-text)',
                }}
                type="button"
              >
                {isFa ? 'انتخاب تصویر' : 'Upload Image'}
              </button>
              {portraitDataUrl ? (
                <button
                  className="w-fit text-xs"
                  onClick={() => setPortraitDataUrl('')}
                  style={{ color: 'var(--color-text-muted)' }}
                  type="button"
                >
                  {isFa ? 'حذف تصویر' : 'Remove image'}
                </button>
              ) : null}
              <p className="text-xs" style={{ color: 'var(--color-text-muted)' }}>
                {isFa
                  ? 'فایل تصویر را بکش و رها کن یا از دستگاه انتخاب کن.'
                  : 'Drop an image here or choose one from your device.'}
              </p>
            </div>
          </div>
        </Field>

        <Field label={copy.fieldCharacterName} required>
          <input
            className="w-full rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--color-gold)]"
            onChange={(event) => setName(event.target.value)}
            placeholder={
              isFa
                ? 'نام کاراکتر را وارد کن...'
                : "Enter your character's name..."
            }
            style={inputStyle}
            type="text"
            value={name}
          />
          {name.trim() === '' ? (
            <p className="mt-1 text-xs" style={{ color: 'var(--color-error)' }}>
              {copy.nameRequired}
            </p>
          ) : null}
        </Field>

        <Field label={copy.fieldAlignment}>
          <div className="grid grid-cols-3 gap-2">
            {ALIGNMENTS.map((item) => (
              <button
                className="rounded-xl border px-2 py-2.5 text-xs font-medium transition-all duration-100"
                key={item.value}
                onClick={() =>
                  setAlignment(item.value === alignment ? null : item.value)
                }
                style={{
                  background:
                    alignment === item.value
                      ? 'var(--color-gold-dim)'
                      : 'var(--color-surface)',
                  borderColor:
                    alignment === item.value
                      ? 'var(--color-gold)'
                      : 'var(--color-border)',
                  color:
                    alignment === item.value
                      ? 'var(--color-gold)'
                      : 'var(--color-text)',
                }}
                type="button"
              >
                <div className="font-bold">{item.short}</div>
                <div className="mt-0.5 text-[10px] opacity-70">
                  {alignmentLabel(item.value)}
                </div>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label={copy.fieldAge}>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-gold)]"
              onChange={(event) => setAge(event.target.value)}
              placeholder={isFa ? 'مثلا ۲۷' : 'e.g. 27'}
              style={inputStyle}
              type="text"
              value={age}
            />
          </Field>
          <Field label={copy.fieldHeight}>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-gold)]"
              onChange={(event) => setHeight(event.target.value)}
              placeholder={isFa ? 'مثلا ۱۷۸ سانتی‌متر' : 'e.g. 5ft 10in'}
              style={inputStyle}
              type="text"
              value={height}
            />
          </Field>
          <Field label={copy.fieldWeight}>
            <input
              className="w-full rounded-xl border px-3 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-gold)]"
              onChange={(event) => setWeight(event.target.value)}
              placeholder={isFa ? 'مثلا ۷۵ کیلو' : 'e.g. 165 lbs'}
              style={inputStyle}
              type="text"
              value={weight}
            />
          </Field>
        </div>

        <Field label={copy.fieldPronouns}>
          <input
            className="w-full rounded-xl border px-4 py-2.5 text-sm outline-none transition-colors focus:border-[var(--color-gold)]"
            onChange={(event) => setPronouns(event.target.value)}
            placeholder={isFa ? 'مثلا او/ایشان' : 'e.g. they/them'}
            style={inputStyle}
            type="text"
            value={pronouns}
          />
        </Field>

        <Field label={copy.fieldBackstory}>
          <textarea
            className="w-full resize-none rounded-xl border px-4 py-3 text-sm outline-none transition-colors focus:border-[var(--color-gold)]"
            onChange={(event) => setBackstory(event.target.value)}
            placeholder={
              isFa
                ? 'تاریخچه، انگیزه‌ها و هدف‌های کاراکترت را بنویس...'
                : "Describe your character's history, motivations, and goals..."
            }
            rows={4}
            style={inputStyle}
            value={backstory}
          />
        </Field>
      </div>
    </div>
  );
}
