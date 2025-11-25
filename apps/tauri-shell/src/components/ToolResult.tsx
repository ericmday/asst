import { useState } from 'react';
import { ChevronDown, CheckCircle2, XCircle, Clock, File, Folder } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ToolCall } from '../types';

interface ToolResultProps {
  toolCall: ToolCall;
}

export function ToolResult({ toolCall }: ToolResultProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const hasResult = toolCall.result !== undefined;
  const isError = toolCall.result?.error !== undefined;

  // Format different tool results
  const formatResult = () => {
    if (!hasResult) return null;

    const result = toolCall.result;

    // Handle errors
    if (isError) {
      return (
        <div className="flex items-start gap-2 p-2 bg-destructive/10 text-destructive rounded border-l-2 border-destructive">
          <XCircle size={16} className="shrink-0 mt-0.5" />
          <span className="text-sm">{result.error}</span>
        </div>
      );
    }

    // Tool-specific formatting
    switch (toolCall.name) {
      case 'write_file':
        return formatFileWrite(result);
      case 'read_file':
        return formatFileRead(result);
      case 'list_files':
        return formatFileList(result);
      case 'search_files':
        return formatSearchResults(result);
      case 'get_system_info':
        return formatSystemInfo(result);
      case 'run_shell_command':
        return formatShellOutput(result);
      case 'open_in_default_app':
        return formatOpenApp(result);
      default:
        return formatGeneric(result);
    }
  };

  const formatFileWrite = (_result: any) => {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
        <span>File written: {toolCall.input?.path}</span>
      </div>
    );
  };

  const formatFileRead = (result: any) => {
    if (typeof result === 'string') {
      const preview = result.length > 200 ? result.substring(0, 200) + '...' : result;
      const needsCollapse = result.length > 200;

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-sm">Read {toolCall.input?.path}</span>
          </div>
          {needsCollapse ? (
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
              <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">
                {preview}
              </pre>
              <CollapsibleContent>
                <pre className="text-sm bg-muted p-2 rounded overflow-x-auto mt-2">
                  {result.substring(200)}
                </pre>
              </CollapsibleContent>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="mt-1 w-full">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                  {isExpanded ? 'Show less' : 'Show all'}
                </Button>
              </CollapsibleTrigger>
            </Collapsible>
          ) : (
            <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">{result}</pre>
          )}
        </div>
      );
    }
    return formatGeneric(result);
  };

  const formatFileList = (result: any) => {
    if (Array.isArray(result)) {
      const itemsToShow = isExpanded ? result : result.slice(0, 10);
      const hasMore = result.length > 10;

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-sm">Found {result.length} items</span>
          </div>
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <ul className="space-y-1 text-sm">
              {itemsToShow.map((item: any, idx: number) => (
                <li key={idx} className="flex items-center gap-2 py-1">
                  {item.type === 'directory' ?
                    <Folder size={14} className="text-muted-foreground" /> :
                    <File size={14} className="text-muted-foreground" />
                  }
                  <span className="truncate">{item.name}</span>
                </li>
              ))}
            </ul>
            {hasMore && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="mt-1 w-full">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                  {isExpanded ? 'Show less' : `Show ${result.length - 10} more...`}
                </Button>
              </CollapsibleTrigger>
            )}
          </Collapsible>
        </div>
      );
    }
    return formatGeneric(result);
  };

  const formatSearchResults = (result: any) => {
    if (Array.isArray(result)) {
      const itemsToShow = isExpanded ? result : result.slice(0, 10);
      const hasMore = result.length > 10;

      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-sm">Found {result.length} files</span>
          </div>
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <ul className="space-y-1 text-sm">
              {itemsToShow.map((file: string, idx: number) => (
                <li key={idx} className="flex items-center gap-2 py-1">
                  <File size={14} className="text-muted-foreground" />
                  <span className="truncate">{file}</span>
                </li>
              ))}
            </ul>
            {hasMore && (
              <CollapsibleTrigger asChild>
                <Button variant="ghost" size="sm" className="mt-1 w-full">
                  <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                  {isExpanded ? 'Show less' : `Show ${result.length - 10} more...`}
                </Button>
              </CollapsibleTrigger>
            )}
          </Collapsible>
        </div>
      );
    }
    return formatGeneric(result);
  };

  const formatSystemInfo = (result: any) => {
    if (typeof result === 'object') {
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
            <span className="text-sm">System Information</span>
          </div>
          <dl className="space-y-1 text-sm">
            {Object.entries(result).map(([key, value]) => (
              <div key={key} className="flex gap-2">
                <dt className="font-medium min-w-[100px]">{key}:</dt>
                <dd className="text-muted-foreground">{String(value)}</dd>
              </div>
            ))}
          </dl>
        </div>
      );
    }
    return formatGeneric(result);
  };

  const formatShellOutput = (result: any) => {
    const output = typeof result === 'string' ? result : result?.output || '';
    const preview = output.length > 300 ? output.substring(0, 300) + '...' : output;
    const needsCollapse = output.length > 300;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
          <span className="text-sm">Command output</span>
        </div>
        {needsCollapse ? (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <pre className="text-sm bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">
              {preview}
            </pre>
            <CollapsibleContent>
              <pre className="text-sm bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap mt-2">
                {output.substring(300)}
              </pre>
            </CollapsibleContent>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-1 w-full">
                <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                {isExpanded ? 'Show less' : 'Show all'}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        ) : (
          <pre className="text-sm bg-muted p-2 rounded overflow-x-auto whitespace-pre-wrap">{output}</pre>
        )}
      </div>
    );
  };

  const formatOpenApp = (_result: any) => {
    return (
      <div className="flex items-center gap-2 text-sm">
        <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
        <span>Opened in default app</span>
      </div>
    );
  };

  const formatGeneric = (result: any) => {
    const resultStr = typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2);
    const preview = resultStr.length > 200 ? resultStr.substring(0, 200) + '...' : resultStr;
    const needsCollapse = resultStr.length > 200;

    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <CheckCircle2 size={16} className="text-green-600 dark:text-green-400" />
          <span className="text-sm">Result</span>
        </div>
        {needsCollapse ? (
          <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">
              {preview}
            </pre>
            <CollapsibleContent>
              <pre className="text-sm bg-muted p-2 rounded overflow-x-auto mt-2">
                {resultStr.substring(200)}
              </pre>
            </CollapsibleContent>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="mt-1 w-full">
                <ChevronDown className={cn("h-4 w-4 transition-transform", isExpanded && "rotate-180")} />
                {isExpanded ? 'Show less' : 'Show all'}
              </Button>
            </CollapsibleTrigger>
          </Collapsible>
        ) : (
          <pre className="text-sm bg-muted p-2 rounded overflow-x-auto">{resultStr}</pre>
        )}
      </div>
    );
  };

  return (
    <Card className="p-3 bg-card">
      {/* Tool header with status badge */}
      <div className="flex items-center gap-2 mb-2">
        <Badge variant={!hasResult ? "secondary" : isError ? "destructive" : "default"} className="gap-1">
          {!hasResult ? (
            <><Clock size={12} /> Running</>
          ) : isError ? (
            <><XCircle size={12} /> Error</>
          ) : (
            <><CheckCircle2 size={12} /> Done</>
          )}
        </Badge>
        <span className="text-sm font-medium">{toolCall.name}</span>
        {hasResult && !isError && (
          <span className="text-sm text-muted-foreground ml-auto">
            {new Date(toolCall.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Show input parameters */}
      {toolCall.input && Object.keys(toolCall.input).length > 0 && (
        <div className="flex flex-wrap gap-2 mb-2 text-sm">
          {Object.entries(toolCall.input).map(([key, value]) => (
            <span key={key} className="text-muted-foreground">
              <span className="font-medium">{key}:</span> {String(value)}
            </span>
          ))}
        </div>
      )}

      {/* Show result or running state */}
      {hasResult ? (
        <div className="mt-2">
          {formatResult()}
        </div>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className="animate-pulse">Running...</span>
        </div>
      )}
    </Card>
  );
}
