/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useEffect, useState } from 'react';
import { ControlDashboard } from './components/ControlDashboard.tsx';
import { GuestStarView } from './components/GuestStarView.tsx';
import { LiveStageView } from './components/LiveStageView.tsx';
import { useLiveSync } from './hooks/useLiveSync.ts';

type AppMode = 'dashboard' | 'stage' | 'guest';

function resolveInitialMode(): AppMode {
  if (typeof window === 'undefined') return 'dashboard';
  const params = new URLSearchParams(window.location.search);
  const m = params.get('mode');
  if (m === 'stage') return 'stage';
  if (m === 'guest') return 'guest';
  return 'dashboard';
}

function resolveRoomParam(): string | null {
  if (typeof window === 'undefined') return null;
  const r = new URLSearchParams(window.location.search).get('room');
  return r && r.trim() ? r.trim() : null;
}

export default function App() {
  const [mode, setMode] = useState<AppMode>(resolveInitialMode);
  const [urlRoomId, setUrlRoomId] = useState<string | null>(resolveRoomParam);

  useEffect(() => {
    const onPopState = () => {
      setMode(resolveInitialMode());
      setUrlRoomId(resolveRoomParam());
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  if (mode === 'guest') {
    return <GuestStarView roomId={urlRoomId || 'hz-live'} />;
  }

  return <OperatorStudioApp mode={mode} setMode={setMode} />;
}

function OperatorStudioApp({
  mode,
  setMode,
}: {
  mode: 'dashboard' | 'stage';
  setMode: (m: AppMode) => void;
}) {
  // Play soothing ambient audio cleanly from the operator dashboard tab (prevents double-audio across tabs)
  const {
    state,
    recentBursts,
    isConnected,
    setAspectMode,
    setHudScale,
    patchState,
    updateFaceFilter,
    updateGuestStar,
    regenerateGuestRoom,
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

  const switchMode = (nextMode: 'dashboard' | 'stage') => {
    setMode(nextMode);
    const url = new URL(window.location.href);
    if (nextMode === 'stage') {
      url.searchParams.set('mode', 'stage');
      url.searchParams.set('room', state.guestStar.roomId);
    } else {
      url.searchParams.delete('mode');
      url.searchParams.delete('room');
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
        onUpdateGuestStar={updateGuestStar}
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
      onUpdateGuestStar={updateGuestStar}
      onRegenerateGuestRoom={regenerateGuestRoom}
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
