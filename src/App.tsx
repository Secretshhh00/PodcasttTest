/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ControlDashboard } from './components/ControlDashboard.tsx';
import { LiveStageView } from './components/LiveStageView.tsx';
import { useLiveSync } from './hooks/useLiveSync.ts';

type AppMode = 'dashboard' | 'stage';

function resolveInitialMode(): AppMode {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  return params.get('mode') === 'stage' ? 'stage' : 'dashboard';
}

export default function App() {
  const [mode, setMode] = useState<AppMode>(resolveInitialMode);

  // Play soothing ambient audio cleanly from the operator dashboard tab (prevents double-audio across tabs)
  const {
    state,
    recentBursts,
    isConnected,
    setAspectMode,
    setHudScale,
    patchState,
    updateFaceFilter,
    toggleLive,
    resetTimer,
    pushChat,
    clearChat,
    triggerBurst,
    sendGift,
    setActiveQa,
    addQaItem,
    removeQaItem,
  } = useLiveSync({ defaultAudioLeader: mode === 'dashboard' });

  useEffect(() => {
    const onPopState = () => {
      setMode(resolveInitialMode());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const switchMode = (nextMode: AppMode) => {
    setMode(nextMode);
    const url = new URL(window.location.href);
    if (nextMode === 'stage') {
      url.searchParams.set('mode', 'stage');
    } else {
      url.searchParams.delete('mode');
    }
    window.history.pushState({}, '', url.toString());
  };

  if (mode === 'stage') {
    return (
      <LiveStageView
        state={state}
        recentBursts={recentBursts}
        onTriggerBurst={triggerBurst}
        onPushChat={pushChat}
        onUpdateFilter={updateFaceFilter}
        onToggleAudio={() =>
          patchState({
            ambientAudio: {
              ...state.ambientAudio,
              enabled: !state.ambientAudio.enabled,
            },
          })
        }
        onSwitchToDashboard={() => switchMode('dashboard')}
      />
    );
  }

  return (
    <ControlDashboard
      state={state}
      isConnected={isConnected}
      onSetAspectMode={setAspectMode}
      onSetHudScale={setHudScale}
      onPatchState={patchState}
      onUpdateFilter={updateFaceFilter}
      onToggleLive={toggleLive}
      onResetTimer={resetTimer}
      onPushChat={pushChat}
      onClearChat={clearChat}
      onTriggerBurst={triggerBurst}
      onSendGift={sendGift}
      onSetActiveQa={setActiveQa}
      onAddQa={addQaItem}
      onRemoveQa={removeQaItem}
      onOpenInlineStage={() => switchMode('stage')}
    />
  );
}
