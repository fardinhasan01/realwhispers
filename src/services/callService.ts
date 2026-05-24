import {
  getDb,
  ref,
  set,
  update,
  remove,
  push,
  onValue,
  serverTimestamp,
} from "@/lib/firebase";
import type { Unsubscribe } from "firebase/database";
import { getUserId, initUserId } from "@/lib/user-id";
import { ensureAuth } from "@/lib/firebase";
import { normalizeRoomCode } from "@/lib/room-code";
import { isRoomMember } from "@/services/roomService";

const ICE_SERVERS: RTCIceServer[] = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" },
];

export type CallStatus = "ringing" | "accepted" | "declined" | "ended" | "missed";
export type CallType = "voice" | "video";

export interface CallState {
  status: CallStatus;
  type: CallType;
  callerId: string;
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

const RING_TIMEOUT_MS = 45_000;

function callRef(roomCode: string) {
  return ref(getDb(), `calls/${normalizeRoomCode(roomCode)}`);
}

async function ensureReady() {
  await ensureAuth();
  await initUserId();
}

export class CallService {
  private pc: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private remoteStream: MediaStream | null = null;
  private unsub: Unsubscribe | null = null;
  private ringTimer: ReturnType<typeof setTimeout> | null = null;
  private durationTimer: ReturnType<typeof setInterval> | null = null;
  private roomCode = "";
  private callType: CallType = "voice";
  private events: CallEvents = {};
  private facingMode: "user" | "environment" = "user";
  private muted = false;
  private speakerOn = true;

  constructor(events: CallEvents = {}) {
    this.events = events;
  }

  listen(roomCode: string) {
    this.roomCode = normalizeRoomCode(roomCode);
    if (this.unsub) this.unsub();
    this.unsub = onValue(callRef(this.roomCode), (snap) => {
      const val = snap.val() as Record<string, unknown> | null;
      if (!val) {
        this.events.onStateChange?.(null);
        return;
      }
      this.events.onStateChange?.({
        status: (val.callStatus ?? val.status) as CallStatus,
        type: val.type as CallType,
        callerId: val.callerId as string,
        calleeId: val.calleeId as string | undefined,
        startedAt: val.startedAt as number | undefined,
      });
    });
  }

  stopListening() {
    if (this.unsub) { this.unsub(); this.unsub = null; }
  }

  private async createPeer(): Promise<RTCPeerConnection> {
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    pc.onicecandidate = (e) => {
      if (!e.candidate || !this.roomCode) return;
      const uid = getUserId();
      const candidateRef = push(ref(getDb(), `calls/${this.roomCode}/iceCandidates/${uid}`));
      void set(candidateRef, {
        candidate: e.candidate.candidate,
        sdpMid: e.candidate.sdpMid,
        sdpMLineIndex: e.candidate.sdpMLineIndex,
      });
    };
    pc.ontrack = (e) => {
      if (!this.remoteStream) {
        this.remoteStream = new MediaStream();
        this.events.onRemoteStream?.(this.remoteStream);
      }
      this.remoteStream.addTrack(e.track);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.events.onError?.("Connection unstable — trying to recover…");
      }
    };
    return pc;
  }

  private async getMedia(type: CallType): Promise<MediaStream> {
    const constraints: MediaStreamConstraints = {
      audio: true,
      video: type === "video" ? { facingMode: this.facingMode } : false,
    };
    return navigator.mediaDevices.getUserMedia(constraints);
  }

  async startCall(roomCode: string, type: CallType): Promise<void> {
    await ensureReady();
    const code = normalizeRoomCode(roomCode);
    if (!(await isRoomMember(code))) {
      this.events.onError?.("You must be in this room to call");
      return;
    }
    this.roomCode = code;
    this.callType = type;
    const uid = getUserId();

    try {
      this.localStream = await this.getMedia(type);
      this.events.onLocalStream?.(this.localStream);

      this.pc = await this.createPeer();
      this.localStream.getTracks().forEach((t) => this.pc!.addTrack(t, this.localStream!));

      const offer = await this.pc.createOffer();
      await this.pc.setLocalDescription(offer);

      await set(callRef(code), {
        callStatus: "ringing",
        type,
        callerId: uid,
        startedAt: Date.now(),
        offer: { type: offer.type, sdp: offer.sdp },
      });

      this.listenForAnswer(code);
      this.listenForIce(code, uid);

      this.ringTimer = setTimeout(() => {
        void this.endCall("missed");
      }, RING_TIMEOUT_MS);
    } catch (err) {
      this.events.onError?.(err instanceof Error ? err.message : "Could not start call");
      await this.cleanup();
    }
  }

  private listenForAnswer(code: string) {
    const uid = getUserId();
    onValue(ref(getDb(), `calls/${code}/answer`), async (snap) => {
      const answer = snap.val();
      if (!answer || !this.pc || uid !== (await this.getCallerId(code))) return;
      if (this.pc.signalingState !== "have-local-offer") return;
      await this.pc.setRemoteDescription(new RTCSessionDescription(answer));
      await update(callRef(code), { callStatus: "accepted" });
      this.startDurationTimer();
      if (this.ringTimer) clearTimeout(this.ringTimer);
    });
  }

  private listenForIce(code: string, myUid: string) {
    onValue(ref(getDb(), `calls/${code}/iceCandidates`), async (snap) => {
      if (!this.pc || !snap.exists()) return;
      const all = snap.val() as Record<string, Record<string, {
        candidate: string;
        sdpMid: string | null;
        sdpMLineIndex: number | null;
      }>>;
      for (const [uid, candidates] of Object.entries(all)) {
        if (uid === myUid) continue;
        for (const c of Object.values(candidates)) {
          try {
            await this.pc.addIceCandidate(new RTCIceCandidate(c));
          } catch { /* ignore duplicate */ }
        }
      }
    });
  }

  private async getCallerId(code: string): Promise<string> {
    const snap = await import("firebase/database").then(({ get }) =>
      get(ref(getDb(), `calls/${code}/callerId`)),
    );
    return snap.val() as string;
  }

  async acceptCall(roomCode: string): Promise<void> {
    await ensureReady();
    const code = normalizeRoomCode(roomCode);
    if (!(await isRoomMember(code))) return;

    try {
      const snap = await import("firebase/database").then(({ get }) => get(callRef(code)));
      const data = snap.val();
      if (!data?.offer) return;

      this.callType = data.type ?? "voice";
      this.roomCode = code;
      this.localStream = await this.getMedia(this.callType);
      this.events.onLocalStream?.(this.localStream);

      this.pc = await this.createPeer();
      this.localStream.getTracks().forEach((t) => this.pc!.addTrack(t, this.localStream!));

      await this.pc.setRemoteDescription(new RTCSessionDescription(data.offer));
      const answer = await this.pc.createAnswer();
      await this.pc.setLocalDescription(answer);

      const uid = getUserId();
      await update(callRef(code), {
        callStatus: "accepted",
        calleeId: uid,
        answer: { type: answer.type, sdp: answer.sdp },
      });

      this.listenForIce(code, uid);
      this.startDurationTimer();
    } catch (err) {
      this.events.onError?.(err instanceof Error ? err.message : "Could not accept call");
      await this.declineCall(code);
    }
  }

  async declineCall(roomCode: string): Promise<void> {
    const code = normalizeRoomCode(roomCode);
    await update(callRef(code), { callStatus: "declined" });
    setTimeout(() => void remove(callRef(code)), 2000);
    await this.cleanup();
  }

  async endCall(status: CallStatus = "ended"): Promise<void> {
    if (this.roomCode) {
      await update(callRef(this.roomCode), { callStatus: status });
      setTimeout(() => void remove(callRef(this.roomCode)), 2000);
    }
    await this.cleanup();
  }

  toggleMute(): boolean {
    this.muted = !this.muted;
    this.localStream?.getAudioTracks().forEach((t) => { t.enabled = !this.muted; });
    return this.muted;
  }

  toggleSpeaker(on: boolean) {
    this.speakerOn = on;
    const remote = document.querySelector("video[data-remote]") as HTMLVideoElement | null;
    if (remote) remote.volume = on ? 1 : 0;
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
    this.localStream.removeTrack(this.localStream.getVideoTracks()[0]);
    this.localStream.addTrack(newTrack);
    this.events.onLocalStream?.(this.localStream);
  }

  private startDurationTimer() {
    const start = Date.now();
    this.durationTimer = setInterval(() => {
      this.events.onDuration?.(Math.floor((Date.now() - start) / 1000));
    }, 1000);
  }

  private async cleanup() {
    if (this.ringTimer) clearTimeout(this.ringTimer);
    if (this.durationTimer) clearInterval(this.durationTimer);
    this.localStream?.getTracks().forEach((t) => t.stop());
    this.pc?.close();
    this.localStream = null;
    this.remoteStream = null;
    this.pc = null;
    this.events.onLocalStream?.(null);
    this.events.onRemoteStream?.(null);
  }

  getLocalStream() { return this.localStream; }
  getRemoteStream() { return this.remoteStream; }
}

export function subscribeIncomingCalls(
  roomCodes: string[],
  onIncoming: (roomCode: string, state: CallState) => void,
): () => void {
  const uid = getUserId();
  const unsubs = roomCodes.map((code) => {
    const c = normalizeRoomCode(code);
    return onValue(callRef(c), (snap) => {
      const val = snap.val() as Record<string, unknown> | null;
      if (!val) return;
      const status = (val.callStatus ?? val.status) as CallStatus;
      if (status === "ringing" && val.callerId !== uid) {
        onIncoming(c, {
          status,
          type: val.type as CallType,
          callerId: val.callerId as string,
          calleeId: val.calleeId as string | undefined,
          startedAt: val.startedAt as number | undefined,
        });
      }
    });
  });
  return () => unsubs.forEach((u) => u());
}
