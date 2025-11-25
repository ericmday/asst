// Screen reader announcements
export function announce(message: string, priority: 'polite' | 'assertive' = 'polite') {
  const announcement = document.createElement('div')
  announcement.setAttribute('role', 'status')
  announcement.setAttribute('aria-live', priority)
  announcement.setAttribute('aria-atomic', 'true')
  announcement.className = 'sr-only'
  announcement.textContent = message

  document.body.appendChild(announcement)
  setTimeout(() => document.body.removeChild(announcement), 1000)
}

// Generate unique IDs for ARIA relationships
let idCounter = 0
export function useAriaId(prefix: string = 'aria') {
  return `${prefix}-${++idCounter}`
}
