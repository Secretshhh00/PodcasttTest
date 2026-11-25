/**
 * Lightweight zero-dependency MQTT 3.1.1 over WebSocket (WSS Port 443) pub/sub relay.
 * Allows cross-device Guest Star camera & sync to work reliably even on static hosting
 * (e.g. GitHub Pages) and behind strict mobile carrier CGNAT where WebRTC UDP/TURN fails.
 */

const CLOUD_MQTT_BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
];

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function encodeRemainingLength(length: number): number[] {
  const bytes: number[] = [];
  let x = length;
  do {
    let encoded = x % 128;
    x = Math.floor(x / 128);
    if (x > 0) {
      encoded |= 0x80;
    }
    bytes.push(encoded);
  } while (x > 0);
  return bytes;
}

function encodeUtf8Field(value: string): Uint8Array<ArrayBuffer> {
  const utf8 = textEncoder.encode(value);
  const out = new Uint8Array(new ArrayBuffer(2 + utf8.length));
  out[0] = (utf8.length >> 8) & 0xff;
  out[1] = utf8.length & 0xff;
  out.set(utf8, 2);
  return out;
}

function concatBytes(...parts: Uint8Array[]): Uint8Array<ArrayBuffer> {
  let total = 0;
  for (const part of parts) total += part.length;
  const out = new Uint8Array(new ArrayBuffer(total));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function buildMqttPacket(
  fixedHeaderByte: number,
  body: Uint8Array,
): Uint8Array<ArrayBuffer> {
  const remLen = encodeRemainingLength(body.length);
  const out = new Uint8Array(new ArrayBuffer(1 + remLen.length + body.length));
  out[0] = fixedHeaderByte;
  out.set(remLen, 1);
  out.set(body, 1 + remLen.length);
  return out;
}

function buildConnectPacket(
  clientId: string,
  keepAliveSec = 25,
): Uint8Array<ArrayBuffer> {
  const protoName = encodeUtf8Field('MQTT');
  const flags = new Uint8Array([
    0x04, // Protocol Level 4 (MQTT 3.1.1)
    0x02, // Clean Session
    (keepAliveSec >> 8) & 0xff,
    keepAliveSec & 0xff,
  ]);
  const clientField = encodeUtf8Field(clientId);
  return buildMqttPacket(0x10, concatBytes(protoName, flags, clientField));
}

function buildSubscribePacket(
  packetId: number,
  topic: string,
): Uint8Array<ArrayBuffer> {
  const idBytes = new Uint8Array([(packetId >> 8) & 0xff, packetId & 0xff]);
  const topicBytes = encodeUtf8Field(topic);
  const qos = new Uint8Array([0x00]);
  return buildMqttPacket(0x82, concatBytes(idBytes, topicBytes, qos));
}

function buildPublishPacket(
  topic: string,
  payload: string,
): Uint8Array<ArrayBuffer> {
  const topicBytes = encodeUtf8Field(topic);
  const payloadBytes = textEncoder.encode(payload);
  return buildMqttPacket(0x30, concatBytes(topicBytes, payloadBytes));
}

function buildPingReqPacket(): Uint8Array<ArrayBuffer> {
  return new Uint8Array(new ArrayBuffer(2)).map((_, i) => (i === 0 ? 0xc0 : 0x00));
}

export interface CloudRelayClientOptions {
  subscribeTopic: string;
  onMessage: (payload: unknown) => void;
  onStatusChange?: (connected: boolean) => void;
}

export class CloudRelayClient {
  private ws: WebSocket | null = null;
  private rxBuffer: Uint8Array<ArrayBuffer> = new Uint8Array(new ArrayBuffer(0));
  private brokerIndex = 0;
  private packetId = 1;
  private disposed = false;
  private connected = false;
  private pingTimer: number | null = null;
  private reconnectTimer: number | null = null;
  private connectTimeoutTimer: number | null = null;
  private readonly options: CloudRelayClientOptions;

  constructor(options: CloudRelayClientOptions) {
    this.options = options;
    this.connect();
  }

  public isOpen(): boolean {
    return this.connected && this.ws?.readyState === WebSocket.OPEN;
  }

  public publish(topic: string, payload: unknown): boolean {
    if (!this.isOpen() || !this.ws) return false;
    try {
      const json = JSON.stringify(payload);
      this.ws.send(buildPublishPacket(topic, json));
      return true;
    } catch {
      return false;
    }
  }

  public close(): void {
    this.disposed = true;
    this.clearTimers();
    if (this.connected) {
      this.connected = false;
      this.options.onStatusChange?.(false);
    }
    if (this.ws) {
      try {
        this.ws.close();
      } catch {
        // Ignore
      }
      this.ws = null;
    }
  }

  private clearTimers(): void {
    if (this.pingTimer !== null) {
      window.clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
    if (this.reconnectTimer !== null) {
      window.clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimeoutTimer !== null) {
      window.clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || this.reconnectTimer !== null) return;
    this.brokerIndex = (this.brokerIndex + 1) % CLOUD_MQTT_BROKERS.length;
    this.reconnectTimer = window.setTimeout(() => {
      this.reconnectTimer = null;
      this.connect();
    }, 1200);
  }

  private connect(): void {
    if (this.disposed) return;
    this.clearTimers();
    this.rxBuffer = new Uint8Array(new ArrayBuffer(0));

    const brokerUrl = CLOUD_MQTT_BROKERS[this.brokerIndex];
    let ws: WebSocket;
    try {
      ws = new WebSocket(brokerUrl, 'mqtt');
    } catch {
      this.scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';
    this.ws = ws;

    this.connectTimeoutTimer = window.setTimeout(() => {
      if (!this.connected && this.ws === ws) {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      }
    }, 5000);

    ws.onopen = () => {
      if (this.disposed || this.ws !== ws) return;
      const clientId = `ph_${Math.random().toString(36).slice(2, 10)}`;
      try {
        ws.send(buildConnectPacket(clientId, 25));
      } catch {
        ws.close();
      }
    };

    ws.onmessage = (event) => {
      if (this.disposed || this.ws !== ws) return;
      if (!(event.data instanceof ArrayBuffer)) return;
      const chunk = new Uint8Array(event.data);
      this.rxBuffer = concatBytes(this.rxBuffer, chunk);
      this.drainBuffer(ws);
    };

    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.clearTimers();
      if (this.connected) {
        this.connected = false;
        this.options.onStatusChange?.(false);
      }
      this.scheduleReconnect();
    };

    ws.onerror = () => {
      if (this.ws === ws) {
        try {
          ws.close();
        } catch {
          // Ignore
        }
      }
    };
  }

  private drainBuffer(ws: WebSocket): void {
    while (this.rxBuffer.length >= 2) {
      let multiplier = 1;
      let remLen = 0;
      let idx = 1;
      let completeHeader = true;

      while (true) {
        if (idx >= this.rxBuffer.length) {
          completeHeader = false;
          break;
        }
        const encoded = this.rxBuffer[idx];
        remLen += (encoded & 0x7f) * multiplier;
        idx += 1;
        if ((encoded & 0x80) === 0) break;
        multiplier *= 128;
        if (multiplier > 128 * 128 * 128) {
          this.rxBuffer = new Uint8Array(new ArrayBuffer(0));
          return;
        }
      }

      if (!completeHeader) return;
      const totalPacketLen = idx + remLen;
      if (this.rxBuffer.length < totalPacketLen) return;

      const fixedByte = this.rxBuffer[0];
      const packetBody = this.rxBuffer.slice(idx, totalPacketLen);
      this.rxBuffer = this.rxBuffer.slice(totalPacketLen);

      const packetType = (fixedByte >> 4) & 0x0f;
      if (packetType === 2) {
        // CONNACK
        const returnCode = packetBody.length >= 2 ? packetBody[1] : 1;
        if (returnCode === 0) {
          if (this.connectTimeoutTimer !== null) {
            window.clearTimeout(this.connectTimeoutTimer);
            this.connectTimeoutTimer = null;
          }
          const subId = this.packetId++;
          try {
            ws.send(buildSubscribePacket(subId, this.options.subscribeTopic));
          } catch {
            ws.close();
            return;
          }
          this.connected = true;
          this.options.onStatusChange?.(true);
          this.pingTimer = window.setInterval(() => {
            if (this.ws === ws && ws.readyState === WebSocket.OPEN) {
              try {
                ws.send(buildPingReqPacket());
              } catch {
                // Ignore
              }
            }
          }, 18000);
        } else {
          ws.close();
        }
      } else if (packetType === 3) {
        // PUBLISH
        if (packetBody.length < 2) continue;
        const topicLen = (packetBody[0] << 8) | packetBody[1];
        let payloadOffset = 2 + topicLen;
        const qos = (fixedByte >> 1) & 0x03;
        if (qos > 0) payloadOffset += 2;
        if (payloadOffset > packetBody.length) continue;
        const payloadText = textDecoder.decode(packetBody.slice(payloadOffset));
        try {
          const parsed: unknown = JSON.parse(payloadText);
          this.options.onMessage(parsed);
        } catch {
          // Ignore malformed JSON
        }
      }
    }
  }
}
