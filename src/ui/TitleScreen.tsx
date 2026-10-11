import { useState } from 'react';
import { COMPANIES, RESOURCE_INFO } from '../engine/constants';
import type { SeatConfig } from '../engine/game';
import { RESOURCES } from '../engine/types';
import { ResourceIcon } from './icons';
import { CompanyDot } from './panels';
import { AboutModal, RulesModal } from './modals';
import { VOLTA_BRANDING, VoltaWordmark } from './brand';
import { SHOW_QUICK_DEMO } from './flags';

export interface CustomOptions {
  seats: SeatConfig[];
  quickStart: boolean;
  seed?: number;
  voltaCards?: boolean;
}

type SeatMode = 'human' | 'ai' | 'off';

export function TitleScreen({
  hasSave,
  onDemo,
  onQuickStart,
  onContinue,
  onCustom,
}: {
  hasSave: boolean;
  onDemo: () => void;
  onQuickStart: () => void;
  onContinue: () => void;
  onCustom: (o: CustomOptions) => void;
}) {
  const [custom, setCustom] = useState(false);
  const [rules, setRules] = useState(false);
  const [about, setAbout] = useState(false);
  const [seatModes, setSeatModes] = useState<SeatMode[]>(['human', 'ai', 'ai', 'ai']);
  const [quickStart, setQuickStart] = useState(true);
  const [seedText, setSeedText] = useState('');
  const [voltaCards, setVoltaCards] = useState(false);

  const active = seatModes.filter((m) => m !== 'off').length;
  const customProblem = active < 2 ? 'Pick at least 2 companies.' : null;

  return (
    <div className="title">
      <div className="title-bg" aria-hidden="true">
        {Array.from({ length: 14 }).map((_, i) => (
          <span
            key={i}
            className="title-hex"
            style={{ ['--i' as string]: i, left: `${(i * 37 + 5) % 100}%`, top: `${(i * 53 + 8) % 92}%`, transform: `scale(${0.5 + ((i * 7) % 5) * 0.2})` }}
          />
        ))}
      </div>
      <div className="title-card">
        {VOLTA_BRANDING ? (
          <p className="spec-line" aria-hidden="true">
            SITE MAP · 19 HEXES · 4 COMPANIES · FIRST TO 10 CP
          </p>
        ) : (
          <p className="eyebrow">An unofficial strategy prototype</p>
        )}
        <h1 className="logo">
          SETTLERS <em>of</em> COMPUTE
        </h1>
        <p className="tagline">The race to build the AI economy.</p>
        {VOLTA_BRANDING && (
          <p className="presented-by">
            <span className="presented-rule" aria-hidden="true" />
            <span className="presented-label">Brought to you by</span>
            <VoltaWordmark size={22} />
            <span className="presented-rule" aria-hidden="true" />
          </p>
        )}
        <p className="lede">
          Compute is no longer just for giants. Four ambitious AI companies. One emerging market. Build your infrastructure, make your deals, and become the market leader.
        </p>

        <div className="res-strip" aria-label="Resources">
          {RESOURCES.map((r) => (
            <span key={r} className="res-strip-item" style={{ ['--res' as string]: RESOURCE_INFO[r].color }}>
              <ResourceIcon type={r} size={20} />
              {RESOURCE_INFO[r].label}
            </span>
          ))}
        </div>

        {!custom ? (
          <div className="title-actions">
            <button className="btn primary big" onClick={onQuickStart}>
              ▶ New Game <span className="btn-sub">Found your AI company · You vs. 3 AI rivals</span>
            </button>
            {SHOW_QUICK_DEMO && (
              <button className="btn big" onClick={onDemo}>
                Quick Demo <span className="btn-sub">Internal: a deterministic midgame scenario</span>
              </button>
            )}
            <div className="title-row">
              {hasSave && (
                <button className="btn" onClick={onContinue}>
                  Continue saved game
                </button>
              )}
              <button className="btn" onClick={() => setCustom(true)}>
                Custom game
              </button>
              <button className="btn" onClick={() => setRules(true)}>
                How to play
              </button>
              <button className="btn" onClick={() => setAbout(true)}>
                About
              </button>
            </div>
          </div>
        ) : (
          <div className="custom">
            <h2>Custom game</h2>
            <p className="muted small">Mix humans (pass-and-play on one device) and AI companies, 2–4 total.</p>
            <div className="seats">
              {COMPANIES.map((c, i) => (
                <div key={c.id} className="seat">
                  <CompanyDot companyId={c.id} size={14} />
                  <div className="seat-name">
                    <strong>{c.name}</strong>
                    <span className="small muted">{c.sector}</span>
                  </div>
                  <div className="seg" role="radiogroup" aria-label={`${c.name} seat`}>
                    {(['human', 'ai', 'off'] as SeatMode[]).map((m) => (
                      <button
                        key={m}
                        role="radio"
                        aria-checked={seatModes[i] === m}
                        className={seatModes[i] === m ? 'on' : ''}
                        onClick={() => setSeatModes((s) => s.map((x, j) => (j === i ? m : x)))}
                      >
                        {m === 'human' ? 'Human' : m === 'ai' ? 'AI' : 'Off'}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="custom-opts">
              <label>
                <input type="checkbox" checked={quickStart} onChange={(e) => setQuickStart(e.target.checked)} /> Quick Start opening (uncheck for a manual snake draft)
              </label>
              <label>
                <input type="checkbox" checked={voltaCards} onChange={(e) => setVoltaCards(e.target.checked)} /> Special cards (beta): add 2 × Full-Stack Integration to the Innovation deck
              </label>
              <label>
                Board seed{' '}
                <input
                  type="text"
                  inputMode="numeric"
                  placeholder="random"
                  value={seedText}
                  onChange={(e) => setSeedText(e.target.value.replace(/[^0-9]/g, '').slice(0, 10))}
                  className="seed-input"
                />
              </label>
            </div>
            {customProblem && <p className="why">{customProblem}</p>}
            <div className="title-row">
              <button className="btn" onClick={() => setCustom(false)}>
                Back
              </button>
              <button
                className="btn primary"
                disabled={!!customProblem}
                onClick={() =>
                  onCustom({
                    seats: COMPANIES.map((c, i) => ({ companyId: c.id, mode: seatModes[i] }))
                      .filter((x) => x.mode !== 'off')
                      .map((x) => ({ companyId: x.companyId, isAI: x.mode === 'ai' })),
                    quickStart,
                    seed: seedText ? Number(seedText) : undefined,
                    voltaCards,
                  })
                }
              >
                Start custom game
              </button>
            </div>
          </div>
        )}

        <div className="companies-strip">
          {COMPANIES.map((c) => (
            <div key={c.id} className="co-card" style={{ ['--co' as string]: c.color }}>
              <CompanyDot companyId={c.id} size={12} />
              <div>
                <strong>{c.name}</strong>
                <span className="small muted">{c.sector}</span>
                <span className="tiny muted">{c.tagline}</span>
              </div>
            </div>
          ))}
        </div>

        <p className="disclaimer">
          {VOLTA_BRANDING
            ? 'Concept build: Volta branding is shown for review and is not approved for public release. Catan-inspired; not affiliated with Catan rights holders. Company names in the game are fictional.'
            : 'Independent, unofficial, Catan-inspired creative prototype. Not affiliated with, sponsored or endorsed by Volta or Catan rights holders. All company names are fictional.'}
        </p>
      </div>
      {rules && <RulesModal onClose={() => setRules(false)} />}
      {about && <AboutModal onClose={() => setAbout(false)} />}
    </div>
  );
}
