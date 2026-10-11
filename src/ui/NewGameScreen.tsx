import type { FormEvent } from 'react';
import { useEffect, useRef, useState } from 'react';
import { FINANCING_COST, MAX_COMPANY_NAME, VP_TO_WIN, describeBundle } from '../engine/constants';
import type { RuleOptions } from '../engine/types';
import type { RulesChoice } from './companies';
import { DEFAULT_COMPANY_NAME, HUMAN_COMPANY, RIVALS, cleanCompanyName, profileOf, rivalNamed, rulesFor } from './companies';
import { CompanyDot } from './panels';

/** Drifting hex field behind the title and New Game screens. */
export function TitleBackdrop() {
  return (
    <div className="title-bg" aria-hidden="true">
      {Array.from({ length: 14 }).map((_, i) => (
        <span
          key={i}
          className="title-hex"
          style={{ ['--i' as string]: i, left: `${(i * 37 + 5) % 100}%`, top: `${(i * 53 + 8) % 92}%`, transform: `scale(${0.5 + ((i * 7) % 5) * 0.2})` }}
        />
      ))}
    </div>
  );
}

const RULES_OPTIONS: { id: RulesChoice; title: string; tag?: string; blurb: string; lines: [string, string][] }[] = [
  {
    id: 'compute',
    title: 'Settlers of Compute',
    tag: 'Recommended',
    blurb: 'Financing, Full-Stack Integration and Grid Stability.',
    lines: [
      ['Infrastructure Financing', `upgrade now for ${describeBundle(FINANCING_COST)}, repay from production.`],
      ['Full-Stack Integration', 'build across the stack to deploy AI Factories directly.'],
      ['Grid Stability', 'after a Grid Disruption the grid stays calm for 6 rolls; outages last 4.'],
    ],
  },
  {
    id: 'classic',
    title: 'Classic',
    blurb: 'The original rules: roll, collect, trade and build.',
    lines: [
      ['Original rules', 'roll, collect, trade and build.'],
      ['', 'No Financing, no Full-Stack Integration.'],
    ],
  },
];

/** Settlers of Compute (Financing + Full-Stack) or Classic. Shared by New Game and Custom game. */
export function RulesPicker({ value, onChange, name }: { value: RulesChoice; onChange: (c: RulesChoice) => void; name: string }) {
  return (
    <div className="rules-pick" role="radiogroup" aria-label="Rules">
      {RULES_OPTIONS.map((o) => (
        <label key={o.id} className={`rules-option${value === o.id ? ' on' : ''}`}>
          <input type="radio" name={name} value={o.id} checked={value === o.id} onChange={() => onChange(o.id)} />
          <span className="rules-option-head">
            <strong>{o.title}</strong>
            {o.tag && <span className="rules-tag">{o.tag}</span>}
          </span>
          {/* Phones show the one-line blurb so both options fit above the Start button. */}
          <span className="rules-blurb small">{o.blurb}</span>
          {o.lines.map(([k, v]) => (
            <span key={k + v} className="rules-line small">
              {k && <b>{k}: </b>}
              {v}
            </span>
          ))}
        </label>
      ))}
    </div>
  );
}

export interface NewGameChoice {
  /** Already cleaned with `cleanCompanyName`. */
  name: string;
  rules: RuleOptions;
}

/** One-screen setup for the standard game: name your company, meet the rivals, pick the rules. */
export function NewGameScreen({
  initialName,
  initialRules,
  onStart,
  onBack,
}: {
  initialName: string;
  initialRules: RulesChoice;
  onStart: (o: NewGameChoice) => void;
  onBack: () => void;
}) {
  const [name, setName] = useState(initialName);
  const [rules, setRules] = useState<RulesChoice>(initialRules);
  const inputRef = useRef<HTMLInputElement>(null);
  const finalName = cleanCompanyName(name, DEFAULT_COMPANY_NAME);
  const clash = rivalNamed(finalName);
  const problem = clash ? `${clash} is already in this market. Pick another name.` : null;
  const you = profileOf(HUMAN_COMPANY.id);

  const start = () => {
    if (!problem) onStart({ name: finalName, rules: rulesFor(rules) });
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    start();
  };

  // With a mouse, focus the name ready to overwrite. On touch, wait for a tap (no surprise keyboard).
  useEffect(() => {
    if (window.matchMedia?.('(pointer: fine)').matches) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, []);

  // Enter starts from anywhere on the screen (the name field submits the form itself); Esc goes back.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        onBack();
        return;
      }
      if (e.key !== 'Enter') return;
      const t = e.target;
      if (t instanceof HTMLButtonElement || t instanceof HTMLAnchorElement || t instanceof HTMLTextAreaElement) return;
      if (t instanceof HTMLInputElement && t.type === 'text') return;
      e.preventDefault();
      start();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="title setup">
      <TitleBackdrop />
      <form className="title-card setup-card" onSubmit={submit} aria-labelledby="setup-title" noValidate>
        <p className="eyebrow">
          Settlers <em>of</em> Compute · New game
        </p>
        <h1 id="setup-title" className="setup-title">
          Found your AI company
        </h1>
        <p className="setup-premise">
          You run a young AI company racing three rivals for Power, Networking, Land, Capital and GPUs. Turn them into Compute Clusters and AI Factories. First to{' '}
          {VP_TO_WIN} Compute Points wins.
        </p>

        <div className="setup-section you-section" style={{ ['--co' as string]: HUMAN_COMPANY.color }}>
          <label className="field-label" htmlFor="company-name">
            Name your company
          </label>
          <div className="name-row">
            <CompanyDot companyId={HUMAN_COMPANY.id} size={18} />
            <input
              id="company-name"
              ref={inputRef}
              className="name-input"
              type="text"
              value={name}
              maxLength={MAX_COMPANY_NAME}
              placeholder={DEFAULT_COMPANY_NAME}
              autoComplete="off"
              autoCapitalize="words"
              spellCheck={false}
              enterKeyHint="go"
              aria-describedby="company-name-hint"
              onChange={(e) => setName(e.target.value)}
            />
            <span className="name-count" aria-hidden="true">
              {Array.from(name).length}/{MAX_COMPANY_NAME}
            </span>
          </div>
          <p id="company-name-hint" className="field-hint small">
            <span className="your-color">
              <i aria-hidden="true" />
              Your color: {you.colorName}
            </span>
            <span className="muted"> · {HUMAN_COMPANY.sector} · You move first</span>
          </p>
          {problem && (
            <p className="why small" role="alert">
              {problem}
            </p>
          )}
        </div>

        <section className="setup-section" aria-labelledby="rules-h">
          <h2 id="rules-h" className="setup-h">
            Rules
          </h2>
          <RulesPicker value={rules} onChange={setRules} name="new-game-rules" />
        </section>

        <section className="setup-section" aria-labelledby="rivals-h">
          <h2 id="rivals-h" className="setup-h">
            Your rivals <span className="muted">· computer-controlled</span>
          </h2>
          <div className="rival-cards">
            {RIVALS.map((c) => (
              <div key={c.id} className="rival-card" style={{ ['--co' as string]: c.color }}>
                <CompanyDot companyId={c.id} size={12} />
                <div>
                  <strong>{c.name}</strong>
                  <span className="small muted">{c.sector}</span>
                  <span className="small rival-plan">{profileOf(c.id).plan}</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="setup-actions">
          <button type="button" className="btn" onClick={onBack}>
            Back
          </button>
          <button type="submit" className="btn primary big setup-start" disabled={!!problem}>
            ▶ Start game <span className="btn-sub">as {finalName}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
