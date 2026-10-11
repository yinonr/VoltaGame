import { useState } from 'react';
import { VOLTA_BRANDING } from './ui/brand';
import { createDemoGame } from './engine/demo';
import { createGame } from './engine/game';
import type { CustomOptions } from './ui/TitleScreen';
import { TitleScreen } from './ui/TitleScreen';
import type { NewGameChoice } from './ui/NewGameScreen';
import { NewGameScreen } from './ui/NewGameScreen';
import { GameScreen } from './ui/GameScreen';
import { loadSavedGame, useGame } from './ui/useGame';
import type { RulesChoice } from './ui/companies';
import { DEFAULT_COMPANY_NAME, choiceOf, loadLastCompanyName, newGameSeats, rememberCompanyName } from './ui/companies';

// Staged co-branding: enables the restrained Volta design details in styles.css.
if (VOLTA_BRANDING) document.documentElement.classList.add('brand-volta');

/** How the New Game screen was opened: what it is prefilled with and where Back returns. */
interface SetupContext {
  from: 'title' | 'game';
  name: string;
  rules: RulesChoice;
  /** Whether the game was already paused when the player left it for the New Game screen. */
  wasPaused: boolean;
}

export default function App() {
  const ctl = useGame();
  const [screen, setScreen] = useState<'title' | 'setup' | 'game'>('title');
  const [intro, setIntro] = useState<'demo' | 'new' | null>(null);
  const [hasSave, setHasSave] = useState(() => loadSavedGame() !== null);
  const [setup, setSetup] = useState<SetupContext | null>(null);

  const startDemo = () => {
    ctl.setPaused(false);
    ctl.setState(createDemoGame());
    setIntro('demo');
    setScreen('game');
  };
  // Every "New game" (title, in-game menu, results) goes through the setup screen, prefilled
  // with the last company name and, from a game, that game's rules.
  const openSetup = (from: SetupContext['from']) => {
    const cur = ctl.getState();
    const yours = cur?.players.find((p) => !p.isAI)?.name;
    setSetup({
      from,
      name: loadLastCompanyName() ?? yours ?? DEFAULT_COMPANY_NAME,
      rules: from === 'game' && cur ? choiceOf(cur.rules) : 'compute',
      wasPaused: ctl.paused,
    });
    if (from === 'game') ctl.setPaused(true);
    setScreen('setup');
  };
  const startNew = (o: NewGameChoice) => {
    rememberCompanyName(o.name);
    ctl.setPaused(false);
    ctl.setState(createGame({ seats: newGameSeats(o.name), rules: o.rules }));
    setIntro('new');
    setScreen('game');
  };
  const leaveSetup = () => {
    if (setup?.from === 'game' && ctl.getState()) {
      ctl.setPaused(setup.wasPaused);
      setScreen('game');
      return;
    }
    setHasSave(loadSavedGame() !== null);
    setScreen('title');
  };
  const startCustom = (o: CustomOptions) => {
    const humans = o.seats.filter((s) => !s.isAI);
    if (humans[0]?.name) rememberCompanyName(humans[0].name);
    ctl.setPaused(false);
    ctl.setState(createGame({ seats: o.seats, quickStart: o.quickStart, seed: o.seed, voltaCards: o.voltaCards, rules: o.rules }));
    // One human: introduce their company. Pass-and-play introduces each player on the pass screen.
    setIntro(humans.length === 1 ? 'new' : null);
    setScreen('game');
  };
  const resume = () => {
    const saved = loadSavedGame();
    if (!saved) {
      setHasSave(false);
      return;
    }
    ctl.setPaused(false);
    ctl.setState(saved);
    setIntro(null);
    setScreen('game');
  };
  const exit = () => {
    setHasSave(loadSavedGame() !== null);
    setScreen('title');
    ctl.setPaused(true);
  };

  if (screen === 'setup' && setup) {
    return <NewGameScreen key={`${setup.from}-${setup.name}`} initialName={setup.name} initialRules={setup.rules} onStart={startNew} onBack={leaveSetup} />;
  }
  if (screen !== 'game' || !ctl.state) {
    return (
      <TitleScreen
        hasSave={hasSave}
        lastName={loadLastCompanyName()}
        onNewGame={() => openSetup('title')}
        onDemo={startDemo}
        onContinue={resume}
        onCustom={startCustom}
      />
    );
  }
  return (
    <GameScreen
      ctl={ctl}
      intro={intro}
      onDismissIntro={() => setIntro(null)}
      onExit={exit}
      onNewGame={() => openSetup('game')}
      onDemo={startDemo}
    />
  );
}
