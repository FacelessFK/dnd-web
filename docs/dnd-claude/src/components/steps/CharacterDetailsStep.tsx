import { useCharacterStore } from '../../store/characterStore'
import type { Alignment } from '../../types'

const ALIGNMENTS: { value: Alignment; short: string }[] = [
  { value: 'Lawful Good', short: 'LG' },
  { value: 'Neutral Good', short: 'NG' },
  { value: 'Chaotic Good', short: 'CG' },
  { value: 'Lawful Neutral', short: 'LN' },
  { value: 'True Neutral', short: 'TN' },
  { value: 'Chaotic Neutral', short: 'CN' },
  { value: 'Lawful Evil', short: 'LE' },
  { value: 'Neutral Evil', short: 'NE' },
  { value: 'Chaotic Evil', short: 'CE' },
]

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-semibold mb-1.5 tracking-wide" style={{ color: 'var(--color-text-muted)' }}>
        {label} {required && <span style={{ color: 'var(--color-error)' }}>*</span>}
      </label>
      {children}
    </div>
  )
}

const inputStyle = {
  background: 'var(--color-surface)',
  borderColor: 'var(--color-border)',
  color: 'var(--color-text)',
}

export function CharacterDetailsStep() {
  const { name, alignment, age, height, weight, pronouns, backstory,
    setName, setAlignment, setAge, setHeight, setWeight, setPronouns, setBackstory } = useCharacterStore()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold mb-1" style={{ color: 'var(--color-text)', letterSpacing: '-0.3px' }}>
          Character Details
        </h2>
        <p className="text-sm" style={{ color: 'var(--color-text-muted)' }}>
          Give your character a name and personality.
        </p>
      </div>

      <div className="max-w-xl space-y-5">
        <Field label="Character Name" required>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Enter your character's name…"
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[var(--color-gold)] transition-colors"
            style={inputStyle}
          />
          {name.trim() === '' && (
            <p className="text-xs mt-1" style={{ color: 'var(--color-error)' }}>Name is required</p>
          )}
        </Field>

        <Field label="Alignment">
          <div className="grid grid-cols-3 gap-2">
            {ALIGNMENTS.map((a) => (
              <button
                key={a.value}
                onClick={() => setAlignment(a.value === alignment ? null : a.value)}
                className="py-2.5 px-2 rounded-xl border text-xs font-medium transition-all duration-100"
                style={{
                  background: alignment === a.value ? 'var(--color-gold-dim)' : 'var(--color-surface)',
                  borderColor: alignment === a.value ? 'var(--color-gold)' : 'var(--color-border)',
                  color: alignment === a.value ? 'var(--color-gold)' : 'var(--color-text)',
                }}
              >
                <div className="font-bold">{a.short}</div>
                <div className="text-[10px] mt-0.5 opacity-70">{a.value}</div>
              </button>
            ))}
          </div>
        </Field>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Age">
            <input
              type="text"
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="e.g. 27"
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--color-gold)] transition-colors"
              style={inputStyle}
            />
          </Field>
          <Field label="Height">
            <input
              type="text"
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="e.g. 5ft 10in"
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--color-gold)] transition-colors"
              style={inputStyle}
            />
          </Field>
          <Field label="Weight">
            <input
              type="text"
              value={weight}
              onChange={(e) => setWeight(e.target.value)}
              placeholder="e.g. 165 lbs"
              className="w-full px-3 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--color-gold)] transition-colors"
              style={inputStyle}
            />
          </Field>
        </div>

        <Field label="Pronouns">
          <input
            type="text"
            value={pronouns}
            onChange={(e) => setPronouns(e.target.value)}
            placeholder="e.g. they/them"
            className="w-full px-4 py-2.5 rounded-xl border text-sm outline-none focus:border-[var(--color-gold)] transition-colors"
            style={inputStyle}
          />
        </Field>

        <Field label="Backstory">
          <textarea
            value={backstory}
            onChange={(e) => setBackstory(e.target.value)}
            placeholder="Describe your character's history, motivations, and goals…"
            rows={4}
            className="w-full px-4 py-3 rounded-xl border text-sm outline-none focus:border-[var(--color-gold)] transition-colors resize-none"
            style={inputStyle}
          />
        </Field>
      </div>
    </div>
  )
}
