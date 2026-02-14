import { useState, useEffect, useRef } from 'react';

/**
 * usePeerPresence — tracks how many browser tabs/windows are viewing the same vault.
 *
 * Uses BroadcastChannel API (same-origin, cross-tab communication).
 * Each tab with a vault page announces its presence via periodic heartbeats.
 * Peers are considered alive if their heartbeat was received within the last HEARTBEAT_INTERVAL * 2.
 *
 * This is NOT a full WebRTC P2P system — it's a lightweight presence tracker
 * that shows users how many peers are "seeding" the same content.
 */

const HEARTBEAT_INTERVAL = 2000; // 2 seconds
const PEER_TIMEOUT = HEARTBEAT_INTERVAL * 2.5; // consider peer dead after this
const CHANNEL_PREFIX = 'lv-vault-';

export function usePeerPresence(vaultId, active = true) {
  const [peerCount, setPeerCount] = useState(0);
  const peersRef = useRef(new Map()); // Map<peerId, lastSeenTimestamp>
  const myIdRef = useRef(crypto.randomUUID());
  const channelRef = useRef(null);
  const heartbeatRef = useRef(null);
  const cleanupRef = useRef(null);

  useEffect(() => {
    if (!vaultId || !active) {
      return;
    }

    // Check if BroadcastChannel is supported
    if (typeof BroadcastChannel === 'undefined') {
      return;
    }

    const myId = myIdRef.current;
    const peers = peersRef.current;
    peers.clear();

    try {
      const channel = new BroadcastChannel(`${CHANNEL_PREFIX}${vaultId}`);
      channelRef.current = channel;

      // Handle incoming messages
      channel.onmessage = (event) => {
        const { type, peerId } = event.data || {};
        if (!peerId || peerId === myId) return;

        if (type === 'heartbeat' || type === 'join') {
          peers.set(peerId, Date.now());
          // Update count
          setPeerCount(peers.size);
        } else if (type === 'leave') {
          peers.delete(peerId);
          setPeerCount(peers.size);
        }
      };

      // Announce join
      channel.postMessage({ type: 'join', peerId: myId });

      // Periodic heartbeat
      heartbeatRef.current = setInterval(() => {
        try {
          channel.postMessage({ type: 'heartbeat', peerId: myId });
        } catch { /* channel may be closed */ }
      }, HEARTBEAT_INTERVAL);

      // Periodic cleanup of stale peers
      cleanupRef.current = setInterval(() => {
        const now = Date.now();
        let changed = false;
        for (const [peerId, lastSeen] of peers.entries()) {
          if (now - lastSeen > PEER_TIMEOUT) {
            peers.delete(peerId);
            changed = true;
          }
        }
        if (changed) {
          setPeerCount(peers.size);
        }
      }, HEARTBEAT_INTERVAL);

      // Cleanup on unmount
      return () => {
        clearInterval(heartbeatRef.current);
        clearInterval(cleanupRef.current);
        try {
          channel.postMessage({ type: 'leave', peerId: myId });
          channel.close();
        } catch { /* ignore */ }
        channelRef.current = null;
        peers.clear();
        setPeerCount(0);
      };
    } catch {
      // BroadcastChannel not available or error
      return;
    }
  }, [vaultId, active]);

  return { peerCount };
}
