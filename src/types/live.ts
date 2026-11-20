export type AspectMode = '9:16' | '16:9';

export type HudScale = 'normal' | 'large' | 'xlarge';

export type FaceFilterId =
  | 'shades'
  | 'heart_glasses'
  | 'crown'
  | 'headphones'
  | 'cat_ears';

export type GiftId =
  | 'rose'
  | 'coffee'
  | 'boba'
  | 'shades'
  | 'heart_glasses'
  | 'headphones'
  | 'cat_ears'
  | 'mic'
  | 'heart_box'
  | 'crown'
  | 'star_rain'
  | 'horizon_galaxy';

export type ReactionKind = 'heart' | 'sparkle' | 'clap' | 'fire';

export type ChatBadge = 'host' | 'mod' | 'top_fan' | 'gifter';

export type ChatSpeed = 'slow' | 'natural' | 'lively';

export type AudioPresetId =
  | 'lofi_chill_podcast'
  | 'acoustic_coffeehouse'
  | 'rain_chords'
  | 'midnight_pad'
  | 'soft_rain';

export interface ChatMessage {
  id: string;
  username: string;
  text: string;
  replyTo?: string;
  badge?: ChatBadge;
  avatarColor: string;
  isJoinEvent?: boolean;
  timestamp: number;
}

export interface ChatScriptLine {
  id: string;
  phaseId: string;
  username: string;
  text: string;
  replyTo?: string;
  badge?: ChatBadge;
  avatarColor: string;
}

export interface ChatPhase {
  id: string;
  indexLabel: string;
  title: string;
  description: string;
  lines: ChatScriptLine[];
}

export interface GiftDefinition {
  id: GiftId;
  name: string;
  coins: number;
  accentHex: string;
  tagline: string;
  tier: 'classic' | 'cozy' | 'spotlight';
  filterId?: FaceFilterId;
}

export interface ActiveGift {
  id: string;
  giftId: GiftId;
  giftName: string;
  sender: string;
  senderColor: string;
  coins: number;
  comboCount: number;
  accentHex: string;
  tier: 'classic' | 'cozy' | 'spotlight';
  filterId?: FaceFilterId;
  updatedAt: number;
  expiresAt: number;
}

export interface FaceFilterState {
  activeFilter: FaceFilterId | null;
  activatedBy: string | null;
  expiresAt: number | null;
  pinned: boolean;
  faceTrackingEnabled: boolean;
  offsetX: number; // percentage -25 to +25
  offsetY: number; // percentage -25 to +25
  scale: number; // 0.6 to 1.6
}

export interface ReactionBurst {
  id: string;
  kind: ReactionKind;
  count: number;
  timestamp: number;
}

export interface QaItem {
  id: string;
  author: string;
  topic: string;
  question: string;
  createdAt: number;
}

export interface NowPlayingState {
  visible: boolean;
  track: string;
  artist: string;
}

export interface AmbientAudioState {
  enabled: boolean;
  preset: AudioPresetId;
  volume: number; // 0 to 1
  sfxEnabled: boolean;
}

export interface LiveState {
  hostName: string;
  streamTitle: string;
  aspectMode: AspectMode;
  hudScale: HudScale;
  isLive: boolean;
  startedAt: number | null;
  viewerCount: number;
  viewerDriftEnabled: boolean;
  likeCount: number;
  activeQaId: string | null;
  qaQueue: QaItem[];
  chatMessages: ChatMessage[];
  activeGifts: ActiveGift[];
  faceFilter: FaceFilterState;
  nowPlaying: NowPlayingState;
  ambientAudio: AmbientAudioState;
}

export type SyncClientAction =
  | { type: 'state:request'; eventId: string }
  | { type: 'state:patch'; eventId: string; patch: Partial<LiveState> }
  | { type: 'stream:toggle_live'; eventId: string; isLive: boolean }
  | { type: 'stream:reset_timer'; eventId: string }
  | { type: 'chat:push'; eventId: string; message: ChatMessage }
  | { type: 'chat:clear'; eventId: string }
  | {
      type: 'reaction:burst';
      eventId: string;
      burst: ReactionBurst;
      likeIncrement: number;
    }
  | {
      type: 'gift:send';
      eventId: string;
      giftId: GiftId;
      sender: string;
      senderColor: string;
    }
  | {
      type: 'filter:update';
      eventId: string;
      patch: Partial<FaceFilterState>;
    }
  | { type: 'qa:set_active'; eventId: string; qaId: string | null }
  | { type: 'qa:add'; eventId: string; item: QaItem }
  | { type: 'qa:remove'; eventId: string; qaId: string };

export type SyncServerMessage =
  | { type: 'state:full'; state: LiveState }
  | { type: 'event:broadcast'; action: SyncClientAction; state: LiveState };
