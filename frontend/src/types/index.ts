export interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  timestamp?: Date
}

export type TabType = 'chat' | 'news'

export interface NewsArticle {
  title: string
  description: string
  url: string
  source: string
  published_at: string
  category?: string
  categoryKey?: string
  imageUrl?: string
}
