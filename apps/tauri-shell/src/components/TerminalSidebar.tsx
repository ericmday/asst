import { X, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'
import type { AgentLog } from '../types'

interface TerminalSidebarProps {
  logs: AgentLog[]
  onClear: () => void
  onClose: () => void
}

export function TerminalSidebar({ logs, onClear, onClose }: TerminalSidebarProps) {

  return (
    <div className="w-[300px] border-l flex flex-col h-full bg-background">
      {/* Header */}
      <div className="border-b px-3 py-2 flex justify-between items-center">
        <span className="font-semibold text-sm">Terminal</span>
        <div className="flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClear}
            title="Clear logs"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            onClick={onClose}
            title="Close terminal"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Log content */}
      <ScrollArea className="flex-1">
        <div className="p-2 font-mono text-xs space-y-0.5">
          {logs.length === 0 ? (
            <div className="text-muted-foreground text-center py-4">
              No logs yet
            </div>
          ) : (
            logs.map((log, i) => (
              <div
                key={i}
                className={cn(
                  "whitespace-pre-wrap break-all",
                  log.source === 'stderr'
                    ? 'text-yellow-600 dark:text-yellow-400'
                    : 'text-gray-600 dark:text-gray-400'
                )}
              >
                <span className="text-muted-foreground">
                  [{new Date(log.timestamp).toLocaleTimeString()}]
                </span>{' '}
                {log.message}
              </div>
            ))
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
