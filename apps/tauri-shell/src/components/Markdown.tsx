import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  // Normalize excessive newlines - collapse to single newlines only
  const normalizedContent = content
    .replace(/\n{2,}/g, '\n')  // Collapse all multiple newlines to single newline
    .trim();

  return (
    <div className="markdown">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Style code blocks
          code({ node, inline, className, children, ...props }: any) {
            return inline ? (
              <code className="inline-code" {...props}>
                {children}
              </code>
            ) : (
              <pre className="code-block">
                <code className={className} {...props}>
                  {children}
                </code>
              </pre>
            );
          },
          // Style links
          a({ node, children, ...props }: any) {
            return (
              <a {...props} target="_blank" rel="noopener noreferrer">
                {children}
              </a>
            );
          },
        }}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}
