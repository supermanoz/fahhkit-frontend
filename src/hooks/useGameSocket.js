import { useEffect, useRef } from 'react'
import { Client } from '@stomp/stompjs'
import { getActiveApiBaseUrl } from '../api/client'

// Live pushes from the backend's STOMP broker (WebSocketBrokerConfig: raw
// WebSocket endpoint at /ws, simple broker on /all and /specific). There's no
// REST way to ask "how did my run get processed" or "did anything land in my
// inbox", so this is the only source for those - everything else in the game
// still works if the socket never connects, it just won't update live.
//
// /specific/{userId} carries three differently-shaped payloads on the one
// destination, told apart by their fields:
//   - RunScoreBreakdownResponse  → has `outcome` (+ runId)
//   - MailResponse               → has `recipientId` + `type`
//   - TerritoryEventResponse     → has `eventType`
// PvP events each get their own sub-destination instead.
const PVP_EVENTS = [
  'pvp-match-found',
  'pvp-queue-expired',
  'pvp-challenge-received',
  'pvp-challenge-reviewed',
  'pvp-challenge-resolved',
]

function toWebSocketUrl(apiBaseUrl) {
  return `${apiBaseUrl.replace(/\/+$/, '').replace(/^http/i, 'ws')}/ws`
}

function parse(message) {
  try {
    return JSON.parse(message.body)
  } catch {
    return null
  }
}

// handlers: { onRunProcessed, onMail, onBroadcastMail, onTerritoryEvent,
// onPvp(eventName, challengeOrQueueEntry) } - all optional. Read through a
// ref so passing fresh inline functions each render doesn't reconnect.
export function useGameSocket(userId, handlers) {
  const handlersRef = useRef(handlers)
  handlersRef.current = handlers

  useEffect(() => {
    if (!userId) return
    const client = new Client({
      brokerURL: toWebSocketUrl(getActiveApiBaseUrl()),
      reconnectDelay: 5000,
      heartbeatIncoming: 10000,
      heartbeatOutgoing: 10000,
      debug: () => {},
    })

    client.onConnect = () => {
      client.subscribe(`/specific/${userId}`, (message) => {
        const payload = parse(message)
        if (!payload) return
        const h = handlersRef.current
        if ('outcome' in payload && payload.runId) {
          h?.onRunProcessed?.(payload)
        } else if (payload.recipientId && payload.type) {
          h?.onMail?.(payload)
        } else if (payload.eventType) {
          h?.onTerritoryEvent?.(payload)
        }
      })
      client.subscribe('/all/mail', (message) => {
        const payload = parse(message)
        if (payload) handlersRef.current?.onBroadcastMail?.(payload)
      })
      PVP_EVENTS.forEach((eventName) => {
        client.subscribe(`/specific/${userId}/${eventName}`, (message) => {
          const payload = parse(message)
          if (payload) handlersRef.current?.onPvp?.(eventName, payload)
        })
      })
    }

    client.activate()
    return () => {
      client.deactivate()
    }
  }, [userId])
}
