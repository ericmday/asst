import { useState } from 'react';
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
        <div className="tool-error">
          <span className="error-icon">✗</span>
          <span className="error-text">{result.error}</span>
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

  const formatFileWrite = (result: any) => {
    return (
      <div className="tool-result-success">
        <span className="success-icon">✓</span>
        <span>File written: {toolCall.input?.path}</span>
      </div>
    );
  };

  const formatFileRead = (result: any) => {
    if (typeof result === 'string') {
      const preview = result.length > 200 ? result.substring(0, 200) + '...' : result;
      return (
        <div className="tool-result-content">
          <div className="content-header">
            <span className="success-icon">✓</span>
            <span>Read {toolCall.input?.path}</span>
            {result.length > 200 && (
              <button
                onClick={() => setIsExpanded(!isExpanded)}
                className="expand-btn"
              >
                {isExpanded ? 'Show less' : 'Show all'}
              </button>
            )}
          </div>
          <pre className="file-content">
            {isExpanded ? result : preview}
          </pre>
        </div>
      );
    }
    return formatGeneric(result);
  };

  const formatFileList = (result: any) => {
    if (Array.isArray(result)) {
      return (
        <div className="tool-result-list">
          <div className="list-header">
            <span className="success-icon">✓</span>
            <span>Found {result.length} items</span>
          </div>
          <ul className="file-list">
            {result.slice(0, isExpanded ? undefined : 10).map((item: any, idx: number) => (
              <li key={idx} className="file-item">
                <span className="file-icon">{item.type === 'directory' ? '📁' : '📄'}</span>
                <span className="file-name">{item.name}</span>
              </li>
            ))}
          </ul>
          {result.length > 10 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="expand-btn"
            >
              {isExpanded ? 'Show less' : `Show ${result.length - 10} more...`}
            </button>
          )}
        </div>
      );
    }
    return formatGeneric(result);
  };

  const formatSearchResults = (result: any) => {
    if (Array.isArray(result)) {
      return (
        <div className="tool-result-list">
          <div className="list-header">
            <span className="success-icon">✓</span>
            <span>Found {result.length} files</span>
          </div>
          <ul className="file-list">
            {result.slice(0, isExpanded ? undefined : 10).map((file: string, idx: number) => (
              <li key={idx} className="file-item">
                <span className="file-icon">📄</span>
                <span className="file-name">{file}</span>
              </li>
            ))}
          </ul>
          {result.length > 10 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="expand-btn"
            >
              {isExpanded ? 'Show less' : `Show ${result.length - 10} more...`}
            </button>
          )}
        </div>
      );
    }
    return formatGeneric(result);
  };

  const formatSystemInfo = (result: any) => {
    if (typeof result === 'object') {
      return (
        <div className="tool-result-keyvalue">
          <div className="list-header">
            <span className="success-icon">✓</span>
            <span>System Information</span>
          </div>
          <dl className="info-list">
            {Object.entries(result).map(([key, value]) => (
              <div key={key} className="info-item">
                <dt>{key}:</dt>
                <dd>{String(value)}</dd>
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

    return (
      <div className="tool-result-shell">
        <div className="content-header">
          <span className="success-icon">✓</span>
          <span>Command output</span>
          {output.length > 300 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="expand-btn"
            >
              {isExpanded ? 'Show less' : 'Show all'}
            </button>
          )}
        </div>
        <pre className="shell-output">
          {isExpanded ? output : preview}
        </pre>
      </div>
    );
  };

  const formatOpenApp = (result: any) => {
    return (
      <div className="tool-result-success">
        <span className="success-icon">✓</span>
        <span>Opened in default app</span>
      </div>
    );
  };

  const formatGeneric = (result: any) => {
    const resultStr = typeof result === 'string'
      ? result
      : JSON.stringify(result, null, 2);
    const preview = resultStr.length > 200 ? resultStr.substring(0, 200) + '...' : resultStr;

    return (
      <div className="tool-result-generic">
        <div className="content-header">
          <span className="success-icon">✓</span>
          <span>Result</span>
          {resultStr.length > 200 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="expand-btn"
            >
              {isExpanded ? 'Show less' : 'Show all'}
            </button>
          )}
        </div>
        <pre className="generic-output">
          {isExpanded ? resultStr : preview}
        </pre>
      </div>
    );
  };

  return (
    <div className="tool-call">
      <div className="tool-header">
        <span className="tool-status">
          {!hasResult ? '⏳' : isError ? '✗' : '✓'}
        </span>
        <span className="tool-name">{toolCall.name}</span>
        {hasResult && !isError && (
          <span className="tool-timestamp">
            {new Date(toolCall.timestamp).toLocaleTimeString()}
          </span>
        )}
      </div>

      {/* Show input parameters */}
      <div className="tool-input">
        {Object.entries(toolCall.input || {}).map(([key, value]) => (
          <span key={key} className="input-param">
            {key}: <span className="param-value">{String(value)}</span>
          </span>
        ))}
      </div>

      {/* Show result or running state */}
      {hasResult ? (
        <div className="tool-result-wrapper">
          {formatResult()}
        </div>
      ) : (
        <div className="tool-running">
          <span className="running-text">Running...</span>
        </div>
      )}
    </div>
  );
}
