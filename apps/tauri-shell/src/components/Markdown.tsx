import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { cn } from '@/lib/utils';

interface MarkdownProps {
  content: string;
}

export function Markdown({ content }: MarkdownProps) {
  // Normalize excessive newlines - collapse to single newlines only
  const normalizedContent = content
    .replace(/\n{2,}/g, '\n')  // Collapse all multiple newlines to single newline
    .trim();

  return (
    <div className={cn(
      "prose prose-sm dark:prose-invert max-w-none",
      "prose-p:my-1 prose-p:leading-relaxed",
      "prose-pre:bg-muted prose-pre:text-muted-foreground prose-pre:p-3 prose-pre:rounded",
      "prose-code:text-primary prose-code:bg-muted prose-code:px-1 prose-code:py-0.5 prose-code:rounded prose-code:text-sm",
      "prose-code:before:content-none prose-code:after:content-none",
      "prose-a:text-primary prose-a:no-underline hover:prose-a:underline",
      "prose-strong:font-semibold prose-strong:text-foreground",
      "prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5"
    )}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          // Prevent double-wrapping of code blocks
          code({ node, inline, className, children, ...props }: any) {
            return inline ? (
              <code {...props}>
                {children}
              </code>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
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
