import { useState } from 'react';
import { createDemoGame } from './engine/demo';
import { createGame } from './engine/game';
import type { CustomOptions } from './ui/TitleScreen';
import { TitleScreen } from './ui/TitleScreen';
import { GameScreen } from './ui/GameScreen';
import { loadSavedGame, useGame } from './ui/useGame';

export default function App() {
  const ctl = useGame();
  const [screen, setScreen] = useState<'title' | 'game'>('title');
  const [intro, setIntro] = useState<'demo' | 'new' | null>(null);
  const [hasSave, setHasSave] = useState(() => loadSavedGame() !== null);

  const startDemo = () => {
    ctl.setPaused(false);
    ctl.setState(createDemoGame());
    setIntro('demo');
    setScreen('game');
  };
  const startQuick = () => {
    ctl.setPaused(false);
    ctl.setState(createGame({}));
    setIntro(null);
    setScreen('game');
  };
  const startCustom = (o: CustomOptions) => {
    ctl.setPaused(false);
    ctl.setState(createGame({ seats: o.seats, quickStart: o.quickStart, seed: o.seed }));
    setIntro(null);
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

  if (screen === 'title' || !ctl.state) {
    return <TitleScreen hasSave={hasSave} onDemo={startDemo} onQuickStart={startQuick} onContinue={resume} onCustom={startCustom} />;
  }
  return (
    <GameScreen
      ctl={ctl}
      intro={intro}
      onDismissIntro={() => setIntro(null)}
      onExit={exit}
      onNewGame={startQuick}
      onDemo={startDemo}
    />
  );
}
