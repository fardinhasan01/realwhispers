import { get } from "firebase/database";
import {
  getDb,
  ref,
  set,
  update,
  remove,
  push,
  onValue,
} from "@/lib/firebase";
import type { Unsubscribe } from "firebase/database";
import { getUserId, initUserId } from "@/lib/user-id";
import { ensureAuth } from "@/lib/firebase";
import { normalizeRoomCode } from "@/lib/room-code";
import { isRoomMember } from "@/services/roomService";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
  { urls: "stun:stun2.l.google.com:19302" },
];

const RING_TIMEOUT_MS = 45_000;
const ICE_DEBOUNCE_MS = 80;

export type CallStatus =
  | "ringing"
  | "accepted"
  | "rejected"
  | "ended"
  | "missed";

/** @deprecated use rejected */
export type LegacyCallStatus = CallStatus | "declined";

export type CallType = "voice" | "video";

export interface RTCSessionPayload {
  type: RTCSdpType;
  sdp: string;
}

export interface CallSignalingPayload {
  callId: string;
  status: CallStatus;
  type: CallType;
  callerId: string;
  receiverId?: string;
  startedAt?: number;
  offer?: RTCSessionPayload;
  answer?: RTCSessionPayload;
}

export interface CallState {
  callId?: string;
  status: CallStatus;
  type: CallType;
  callerId: string;
  receiverId?: string;
  calleeId?: string;
  startedAt?: number;
}

export interface CallEvents {
  onStateChange?: (state: CallState | null) => void;
  onLocalStream?: (stream: MediaStream | null) => void;
  onRemoteStream?: (stream: MediaStream | null) => void;
  onDuration?: (seconds: number) => void;
  onError?: (msg: string) => void;
}

interface IcePayload {
  candidate: string;
  sdpMid: string | null;
  sdpMLineIndex: number | null;
}

function callPath(roomCode: string) {
  return `calls/${normalizeRoomCode(roomCode)}`;
}

function callRef(roomCode: string) {
  return ref(getDb(), callPath(roomCode));
}

async function ensureReady() {
  await ensureAuth();
  await initUserId();
}

function parseStatus(raw: Record<string, unknown>): CallStatus {
  const s = (raw.status ?? raw.callStatus) as string;
  if (s === "declined") return "rejected";
  return s as CallStatus;
}

function toCallState(raw: Record<string, unknown> | null): CallState | null {
  if (!raw) return null;
  return {
    callId: raw.callId as string | undefined,
    status: parseStatus(raw),
    type: (raw.type as CallType) ?? "voice",
    callerId: raw.callerId as string,
    receiverId: (raw.receiverId ?? raw.calleeId) as string | undefined,
    calleeId: (raw.receiverId ?? raw.calleeId) as string | undefined,
    startedAt: raw.startedAt as number | undefined,
  };
}

function newCallId(): string {
  return typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `call_${Date.now()}`;
}

export class CallService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private unsubs: Unsubscribe[] = [];
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private iceDebounce: ReturnType<typeof setTimeout> | null = null;
  private roomCode = "";
  private callId = "";
  private callType: CallType = "voice";
  private events: CallEvents = {};
  private facingMode: "user" | "environment" = "user";
  private muted = false;
  private speakerOn = true;
  private isCaller = false;
  private roleAttached = false;
  private addedIce = new Set<string>();
  private iceQueue: RTCIceCandidateInit[] = [];
  private cleaning = false;

  constructor(events: CallEvents = {}) {
    this.events = events;
  }

  /** Real-time call document listener */
  onCallUpdate(roomCode: string): void {
    this.roomCode = normalizeRoomCode(roomCode);
    this.clearListeners();

    const unsub = onValue(callRef(this.roomCode), (snap) => {
      const raw = snap.val() as Record<string, unknown> | null;
      const state = toCallState(raw);
      console.log("[WhisperLock] onCallUpdate", { room: this.roomCode, state });
      this.events.onStateChange?.(state);

      if (!raw || !state) return;

      if (state.callId) this.callId = state.callId;

      const uid = getUserId();
      if (["ended", "rejected", "missed"].includes(state.status)) {
        if (this.roleAttached || this.pc) void this.cleanupLocal(false);
        return;
      }
    });
    this.unsubs.push(unsub);
  }

  listen(roomCode: string) {
    this.onCallUpdate(roomCode);
  }

  stopListening() {
    this.clearListeners();
  }

  private clearListeners() {
    this.unsubs.forEach((u) => u());
    this.unsubs = [];
    if (this.iceDebounce) clearTimeout(this.iceDebounce);
    this.iceDebounce = null;
  }

  private onOffer(roomCode: string) {
    const unsub = onValue(ref(getDb(), `${callPath(roomCode)}/offer`), (snap) => {
      const offer = snap.val() as RTCSessionPayload | null;
      if (!offer?.sdp) return;
      console.log("[WhisperLock] onOffer", { roomCode, hasPc: !!this.pc });
      if (this.pc && !this.isCaller && this.pc.signalingState === "stable") {
        void this.handleRemoteOffer(offer);
      }
    });
    this.unsubs.push(unsub);
  }

  private onAnswer(roomCode: string) {
    const unsub = onValue(ref(getDb(), `${callPath(roomCode)}/answer`), async (snap) => {
      const answer = snap.val() as RTCSessionPayload | null;
      if (!answer?.sdp || !this.pc || !this.isCaller) return;
      if (this.pc.signalingState !== "have-local-offer") return;
      console.log("[WhisperLock] onAnswer — applying");
      try {
        await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
        await this.drainIceQueue();
        if (this.ringTimer) clearTimeout(this.ringTimer);
        this.startDurationTimer();
      } catch (err) {
        console.error("[WhisperLock] onAnswer failed", err);
      }
    });
    this.unsubs.push(unsub);
  }

  private onIceCandidate(roomCode: string) {
    const myUid = getUserId();
    const unsub = onValue(
      ref(getDb(), `${callPath(roomCode)}/iceCandidates`),
      (snap) => {
        if (!this.pc || !snap.exists()) return;
        if (this.iceDebounce) clearTimeout(this.iceDebounce);
        this.iceDebounce = setTimeout(() => {
          void this.processIceCandidates(snap.val() as Record<string, Record<string, IcePayload>>, myUid);
        }, ICE_DEBOUNCE_MS);
      },
    );
    this.unsubs.push(unsub);
  }

  private async processIceCandidates(
    all: Record<string, Record<string, IcePayload>> | null,
    myUid: string,
  ) {
    if (!all || !this.pc) return;
    for (const [uid, bucket] of Object.entries(all)) {
      if (uid === myUid) continue;
      for (const [id, c] of Object.entries(bucket)) {
        const key = `${uid}:${id}`;
        if (this.addedIce.has(key)) continue;
        const init: RTCIceCandidateInit = {
          candidate: c.candidate,
          sdpMid: c.sdpMid,
          sdpMLineIndex: c.sdpMLineIndex,
        };
        if (!this.pc.remoteDescription) {
          this.iceQueue.push(init);
          this.addedIce.add(key);
          continue;
        }
        try {
          await this.pc.addIceCandidate(new RTCIceCandidate(init));
          this.addedIce.add(key);
        } catch (err) {
          console.warn("[WhisperLock] ICE add skipped", key, err);
        }
      }
    }
  }

  private async drainIceQueue() {
    if (!this.pc?.remoteDescription) return;
    while (this.iceQueue.length) {
      const c = this.iceQueue.shift()!;
      try {
        await this.pc.addIceCandidate(new RTCIceCandidate(c));
      } catch {
        /* duplicate */
      }
    }
  }

  private attachSignalingListeners(roomCode: string) {
    this.onAnswer(roomCode);
    this.onIceCandidate(roomCode);
    if (!this.isCaller) this.onOffer(roomCode);
  }

  private async createPeer(): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });

    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.roomCode) return;
      const uid = getUserId();
      const candidateRef = push(
        ref(getDb(), `${callPath(this.roomCode)}/iceCandidates/${uid}`),
      );
      void set(candidateRef, {
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
      });
    };

    pc.ontrack = (e) => {
      console.log("[WhisperLock] ontrack", e.track.kind);
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.events.onRemoteStream?.(this.remoteStream);
      }
      const exists = this.remoteStream
        .getTracks()
        .some((t) => t.id === e.track.id);
      if (!exists) this.remoteStream.addTrack(e.track);
    };

    pc.onconnectionstatechange = () => {
      console.log("[WhisperLock] connectionState", pc.connectionState);
      if (pc.connectionState === "connected") {
        console.log("[WhisperLock] peer connected");
      }
      if (pc.connectionState === "failed") {
        this.events.onError?.("Call connection failed — retrying…");
        void pc.restartIce();
      }
      if (pc.connectionState === "disconnected") {
        setTimeout(() => {
          if (pc.connectionState === "disconnected") {
            void this.endCall("ended");
          }
        }, 4000);
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log("[WhisperLock] iceState", pc.iceConnectionState);
      if (pc.iceConnectionState === "failed") {
        void pc.restartIce();
      }
    };

    return pc;
  }

  private async getMedia(type: CallType): Promise<MediaStream> {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera/microphone not supported on this device");
    }
    try {
      return await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
        video:
          type === "video"
            ? { facingMode: this.facingMode, width: { ideal: 1280 }, height: { ideal: 720 } }
            : false,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Permission denied";
      if (msg.includes("NotAllowed") || msg.includes("Permission")) {
        throw new Error("Allow microphone" + (type === "video" ? " and camera" : "") + " to call");
      }
      throw err;
    }
  }

  async startVoiceCall(roomCode: string): Promise<void> {
    return this.startCall(roomCode, "voice");
  }

  async startVideoCall(roomCode: string): Promise<void> {
    return this.startCall(roomCode, "video");
  }

  async startCall(roomCode: string, type: CallType): Promise<void> {
    await ensureReady();
    const code = normalizeRoomCode(roomCode);
    if (!(await isRoomMember(code))) {
      this.events.onError?.("Join this room before calling");
      return;
    }

    await this.cleanupLocal(true);
    this.roomCode = code;
    this.callType = type;
    this.isCaller = true;
    this.roleAttached = true;
    this.callId = newCallId();
    const uid = getUserId();

    console.log("[WhisperLock] startCall", { code, type, callId: this.callId, uid });

    try {
      this.localStream = await this.getMedia(type);
      this.events.onLocalStream?.(this.localStream);

      this.pc = await this.createPeer();
      this.localStream.getTracks().forEach((t) => this.pc!.addTrack(t, this.localStream!));

      const offer = await this.pc.createOffer({
        offerToReceiveAudio: true,
        offerToReceiveVideo: type === "video",
      });
      await this.pc.setLocalDescription(offer);

      await set(callRef(code), {
        callId: this.callId,
        status: "ringing",
        type,
        callerId: uid,
        startedAt: Date.now(),
        offer: { type: offer.type, sdp: offer.sdp! },
      });

      this.onCallUpdate(code);
      this.attachSignalingListeners(code);

      this.ringTimer = setTimeout(() => {
        console.log("[WhisperLock] ring timeout");
        void this.endCall("missed");
      }, RING_TIMEOUT_MS);
    } catch (err) {
      console.error("[WhisperLock] startCall error", err);
      this.events.onError?.(err instanceof Error ? err.message : "Could not start call");
      await this.cleanupLocal(true);
    }
  }

  private async handleRemoteOffer(offer: RTCSessionPayload) {
    if (!this.pc || this.isCaller) return;
    await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
    await this.drainIceQueue();
  }

  async acceptCall(roomCode: string): Promise<void> {
    await ensureReady();
    const code = normalizeRoomCode(roomCode);
    if (!(await isRoomMember(code))) {
      this.events.onError?.("Not a room member");
      return;
    }

    const snap = await get(callRef(code));
    const data = snap.val() as Record<string, unknown> | null;
    if (!data?.offer) {
      console.warn("[WhisperLock] acceptCall — no offer");
      return;
    }

    const offer = data.offer as RTCSessionPayload;
    this.callId = (data.callId as string) ?? newCallId();
    this.callType = (data.type as CallType) ?? "voice";
    this.roomCode = code;
    this.isCaller = false;
    this.roleAttached = true;

    console.log("[WhisperLock] acceptCall", { code, callId: this.callId });

    try {
      await this.cleanupLocal(true);

      this.localStream = await this.getMedia(this.callType);
      this.events.onLocalStream?.(this.localStream);

      this.pc = await this.createPeer();
      this.localStream.getTracks().forEach((t) => this.pc!.addTrack(t, this.localStream!));

      await this.pc.setRemoteDescription(new RTCSessionDescription(offer));
      await this.drainIceQueue();

      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      const uid = getUserId();
      await update(callRef(code), {
        status: "accepted",
        receiverId: uid,
        answer: { type: answer.type, sdp: answer.sdp! },
      });

      this.onCallUpdate(code);
      this.attachSignalingListeners(code);
      this.startDurationTimer();
      if (this.ringTimer) clearTimeout(this.ringTimer);
    } catch (err) {
      console.error("[WhisperLock] acceptCall error", err);
      this.events.onError?.(err instanceof Error ? err.message : "Could not accept call");
      await this.rejectCall(code);
    }
  }

  async rejectCall(roomCode: string): Promise<void> {
    return this.declineCall(roomCode);
  }

  async declineCall(roomCode: string): Promise<void> {
    const code = normalizeRoomCode(roomCode);
    console.log("[WhisperLock] rejectCall", { code });
    await update(callRef(code), { status: "rejected" });
    setTimeout(() => void remove(callRef(code)), 1500);
    await this.cleanupLocal(true);
  }

  async endCall(status: CallStatus = "ended"): Promise<void> {
    if (this.cleaning) return;
    const code = this.roomCode;
    console.log("[WhisperLock] endCall", { code, status });
    if (code) {
      try {
        await update(callRef(code), { status });
      } catch {
        /* ignore */
      }
      setTimeout(() => {
        void remove(callRef(code)).catch(() => {});
        void remove(ref(getDb(), `${callPath(code)}/iceCandidates`)).catch(() => {});
      }, 1200);
    }
    await this.cleanupLocal(true);
    this.events.onStateChange?.(null);
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.localStream?.getAudioTracks().forEach((t) => {
      t.enabled = !this.muted;
    });
    return this.muted;
  }

  setSpeakerEnabled(on: boolean) {
    this.speakerOn = on;
    document.querySelectorAll("[data-call-remote-audio]").forEach((el) => {
      (el as HTMLMediaElement).muted = !on;
    });
    document.querySelectorAll("[data-call-remote-video]").forEach((el) => {
      (el as HTMLVideoElement).muted = !on;
    });
  }

  toggleSpeakerMode(): boolean {
    this.speakerOn = !this.speakerOn;
    this.setSpeakerEnabled(this.speakerOn);
    return this.speakerOn;
  }

  toggleCamera(): boolean {
    const track = this.localStream?.getVideoTracks()[0];
    if (!track) return false;
    track.enabled = !track.enabled;
    return track.enabled;
  }

  async switchCamera(): Promise<void> {
    if (this.callType !== "video" || !this.localStream || !this.pc) return;
    this.facingMode = this.facingMode === "user" ? "environment" : "user";
    const newStream = await this.getMedia("video");
    const newTrack = newStream.getVideoTracks()[0];
    const sender = this.pc.getSenders().find((s) => s.track?.kind === "video");
    if (sender) await sender.replaceTrack(newTrack);
    this.localStream.getVideoTracks().forEach((t) => t.stop());
    const old = this.localStream.getVideoTracks()[0];
    if (old) this.localStream.removeTrack(old);
    this.localStream.addTrack(newTrack);
    newStream.getAudioTracks().forEach((t) => t.stop());
    this.events.onLocalStream?.(this.localStream);
    console.log("[WhisperLock] switchCamera", this.facingMode);
  }

  private startDurationTimer() {
    if (this.durationTimer) clearInterval(this.durationTimer);
    const start = Date.now();
    this.durationTimer = setInterval(() => {
      this.events.onDuration?.(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }

  private async cleanupLocal(clearFirebase: boolean) {
    if (this.cleaning) return;
    this.cleaning = true;
    if (this.ringTimer) clearTimeout(this.ringTimer);
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.ringTimer = null;
    this.durationTimer = null;

    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();

    this.localStream = null;
    this.remoteStream = null;
    this.pc = null;
    this.iceQueue = [];
    this.addedIce.clear();
    this.roleAttached = false;
    this.isCaller = false;

    this.events.onLocalStream?.(null);
    this.events.onRemoteStream?.(null);

    if (!clearFirebase) {
      this.clearListeners();
    }
    this.cleaning = false;
  }

  async cleanup() {
    await this.cleanupLocal(true);
    this.clearListeners();
  }

  getLocalStream() {
    return this.localStream;
  }

  getRemoteStream() {
    return this.remoteStream;
  }
}

/** Listen for incoming rings across cached rooms */
export function subscribeIncomingCalls(
  roomCodes: string[],
  onIncoming: (roomCode: string, state: CallState) => void,
): () => void {
  const uid = getUserId();
  const unsubs = roomCodes.map((code) => {
    const c = normalizeRoomCode(code);
    return onValue(callRef(c), (snap) => {
      const raw = snap.val() as Record<string, unknown> | null;
      if (!raw) return;
      const status = parseStatus(raw);
      const callerId = raw.callerId as string;
      if (status === "ringing" && callerId && callerId !== uid) {
        console.log("[WhisperLock] incoming call", { room: c, callerId });
        onIncoming(c, toCallState(raw)!);
      }
    });
  });
  return () => unsubs.forEach((u) => u());
}

export function onCallUpdate(
  roomCode: string,
  handler: (state: CallState | null) => void,
): Unsubscribe {
  return onValue(callRef(roomCode), (snap) => {
    handler(toCallState(snap.val() as Record<string, unknown> | null));
  });
}
