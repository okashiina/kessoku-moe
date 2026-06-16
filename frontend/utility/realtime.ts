// Thin wrapper over Ably for co-watch rooms, kept deliberately small and
// provider-agnostic so the transport could be swapped later without touching the
// room store, the sync engine, or the chat UI. Everything above this file speaks
// in `RoomConnection`, never in Ably types.
//
// Ably is loaded with a dynamic import so its client only ships to browsers that
// actually open a room (it stays out of the main watch bundle). Auth is via the
// `/api/room/token` endpoint, so the Ably key never reaches the client.

import type {
  ClientOptions,
  InboundMessage,
  PresenceMessage,
  RealtimeClient,
} from 'ably';

type RealtimeCtor = new (options: ClientOptions) => RealtimeClient;

/** Per-member identity carried in presence. */
export interface MemberData {
  name: string;
  avatar?: string;
  // What this member is watching. Lets a peek route a joiner to the room's anime
  // and warn when they typed a code from a different show. `aid` is the
  // /watch/[id] route id; `title` is for display in the mismatch notice.
  aid?: string;
  episode?: number;
  title?: string;
}

export interface RoomMember {
  clientId: string;
  data: MemberData;
}

export interface RoomConnection {
  clientId: string;
  /** Fire-and-forget publish of a room event. */
  publish: (event: string, data: unknown) => void;
  /** Subscribe to a room event; returns an unsubscribe fn. */
  subscribe: (
    event: string,
    cb: (data: unknown, fromClientId: string) => void
  ) => () => void;
  /** Announce/refresh our presence in the room. */
  enter: (data: MemberData) => Promise<void>;
  update: (data: MemberData) => Promise<void>;
  /** Observe the live member list (fires on any join/leave/update). */
  onMembers: (cb: (members: RoomMember[]) => void) => () => void;
  /** Leave presence, detach, and close the connection. */
  close: () => void;
}

const CHANNEL_PREFIX = 'kessoku:room:';

let ctor: RealtimeCtor | null = null;
const loadRealtime = async (): Promise<RealtimeCtor> => {
  if (ctor) return ctor;
  const mod = await import('ably');
  // Tolerate either interop shape (named export vs CJS default) across bundlers.
  const found =
    (mod as unknown as { Realtime?: RealtimeCtor }).Realtime ??
    (mod as unknown as { default?: { Realtime?: RealtimeCtor } }).default
      ?.Realtime;
  if (!found) throw new Error('ably: Realtime constructor not found');
  ctor = found;
  return found;
};

export const connectRoom = async (
  roomId: string,
  clientId: string
): Promise<RoomConnection> => {
  const Rt = await loadRealtime();
  const client = new Rt({
    authUrl: `/api/room/token?clientId=${encodeURIComponent(
      clientId
    )}&room=${encodeURIComponent(roomId)}`,
    clientId,
    // Don't deliver our own messages back to us — we apply local actions
    // optimistically, so an echo would just be noise (and a sync feedback loop).
    echoMessages: false,
  });
  const channel = client.channels.get(`${CHANNEL_PREFIX}${roomId}`);

  const publish = (event: string, data: unknown): void => {
    channel.publish(event, data).catch(() => undefined);
  };

  const subscribe = (
    event: string,
    cb: (data: unknown, fromClientId: string) => void
  ): (() => void) => {
    const listener = (msg: InboundMessage): void =>
      cb(msg.data, msg.clientId ?? '');
    channel.subscribe(event, listener);
    return () => channel.unsubscribe(event, listener);
  };

  const readMembers = async (): Promise<RoomMember[]> => {
    try {
      const present = await channel.presence.get();
      return present.map((p: PresenceMessage) => ({
        clientId: p.clientId ?? '',
        data: (p.data ?? { name: 'guest' }) as MemberData,
      }));
    } catch {
      return [];
    }
  };

  const onMembers = (cb: (members: RoomMember[]) => void): (() => void) => {
    let alive = true;
    const refresh = (): void => {
      readMembers().then((m) => {
        if (alive) cb(m);
      });
    };
    const onPresence = (): void => refresh();
    channel.presence.subscribe(onPresence);
    refresh();
    return () => {
      alive = false;
      channel.presence.unsubscribe(onPresence);
    };
  };

  const enter = (data: MemberData): Promise<void> =>
    channel.presence.enter(data);
  const update = (data: MemberData): Promise<void> =>
    channel.presence.update(data);

  const close = (): void => {
    // Best-effort teardown. presence.leave() is ASYNC, so a sync try/catch can't
    // catch its rejected promise — leaving an already-detaching channel rejects
    // with "channel state is detached", which would surface as an unhandled
    // rejection (the dev error overlay). Await it inside try/catch instead, then
    // close the client, which detaches the channel on its own. We deliberately
    // don't call channel.detach() separately: firing it alongside leave() is what
    // raced into the detached-state error.
    const teardown = async (): Promise<void> => {
      try {
        await channel.presence.leave();
      } catch {
        /* already leaving / detached — fine, we're tearing down */
      }
      try {
        client.close();
      } catch {
        /* ignore */
      }
    };
    // Fire-and-forget: close() is sync teardown. .catch keeps the rejection
    // handled (no unhandled-rejection / dev overlay) without the void operator.
    teardown().catch(() => undefined);
  };

  return { clientId, publish, subscribe, enter, update, onMembers, close };
};
