import { io, Socket } from 'socket.io-client'

/**
 * One realtime connection for the CMS (spec §9.2). The server computes the rooms from the
 * token: the client never names one (RT-04), and the token travels in the `auth` payload, not
 * the query string. The token is read again on every (re)connect so a refreshed access token is
 * picked up without reloading the page.
 */

const API_ORIGIN = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'

/** Events the server emits to `user:{id}` when it writes a notification (notifications.service.js). */
export const NOTIFICATION_EVENTS = ['new_notification', 'notification'] as const

export interface RealtimeHandle {
  disconnect: () => void
}

export function connectRealtime(onNotification: () => void): RealtimeHandle | null {
  if (typeof window === 'undefined') return null
  let socket: Socket
  try {
    socket = io(API_ORIGIN, {
      auth: (cb) => cb({ token: localStorage.getItem('gymsera_access_token') ?? '' }),
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 30000,
      randomizationFactor: 0.5,
    })
  } catch {
    return null
  }

  for (const event of NOTIFICATION_EVENTS) socket.on(event, onNotification)
  // After a drop the push channel may have missed events: ask the server again.
  socket.io.on('reconnect', onNotification)
  // A refused handshake (expired token) is not fatal: the 60 s poll keeps the bell honest.
  socket.on('connect_error', () => undefined)

  return {
    disconnect: () => {
      for (const event of NOTIFICATION_EVENTS) socket.off(event, onNotification)
      socket.disconnect()
    },
  }
}
