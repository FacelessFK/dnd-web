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
    pronouns,
    setAge,
    setAlignment,
    setBackstory,
    setHeight,
    setName,
    setPronouns,
    setWeight,
    weight,
  } = useCharacterStore();
  const { alignment: alignmentLabel, copy, isFa } = useBuilderI18n();

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
