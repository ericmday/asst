import { useState, useEffect } from 'react'
import { listen } from '@tauri-apps/api/event'
import type { AgentLog } from './types'

export function useAgentLogs() {
  const [logs, setLogs] = useState<AgentLog[]>([])

  useEffect(() => {
    let unlisten: (() => void) | null = null

    const setupListener = async () => {
      unlisten = await listen<AgentLog>('agent_log', (event) => {
        setLogs(prev => {
          // Keep only the last 1000 logs to prevent memory issues
          const newLogs = [...prev, event.payload]
          return newLogs.length > 1000 ? newLogs.slice(-1000) : newLogs
        })
      })
    }

    setupListener()

    return () => {
      if (unlisten) {
        unlisten()
      }
    }
  }, [])

  const clearLogs = () => setLogs([])

  return { logs, clearLogs }
}
