import { useState, useRef, useEffect } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { chatStream } from '../api'
import { ChatMessage } from '../types'

interface ChatTabProps {
  onMessageSent?: (question: string) => void
  pendingQuestion?: string | null
  onPendingConsumed?: () => void
}

const SUGGESTIONS = [
  { icon: '⚔️', text: 'O que está acontecendo na guerra da Ucrânia?',   query: 'guerra Russia Ucrania' },
  { icon: '🕊️', text: 'Quais conflitos estão ativos no Oriente Médio?', query: 'conflitos Oriente Medio Israel Palestina' },
  { icon: '🛢️', text: 'Como a tensão em Taiwan afeta o mercado?',        query: 'tensao Taiwan China mercado semicondutores' },
  { icon: '💵', text: 'Impacto das sanções na economia mundial?',        query: 'sanções economicas Russia impacto global' },
  { icon: '🌎', text: 'Situação da América Latina geopolítica',          query: 'America Latina geopolítica conflitos' },
  { icon: '🇧🇷', text: 'Como os conflitos afetam o Brasil?',             query: 'impacto conflitos geopoliticos Brasil economia' },
]

export default function ChatTab({ onMessageSent, pendingQuestion, onPendingConsumed }: ChatTabProps) {
  const [messages, setMessages]     = useState<ChatMessage[]>([])
  const [input, setInput]           = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const abortRef      = useRef<AbortController | null>(null)
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Dispara pergunta vinda do histórico
  useEffect(() => {
    if (pendingQuestion) {
      sendMessage(pendingQuestion)
      onPendingConsumed?.()
    }
  }, [pendingQuestion])

  const sendMessage = async (text?: string) => {
    const question = text || input.trim()
    if (!question || isStreaming) return

    setMessages(prev => [...prev, { role: 'user', content: question }])
    setInput('')
    setIsStreaming(true)
    onMessageSent?.(question)

    const controller = new AbortController()
    abortRef.current = controller

    let assistantContent = ''
    setMessages(prev => [...prev, { role: 'assistant', content: '' }])

    try {
      const generator = chatStream(question, controller.signal)
      for await (const chunk of generator) {
        assistantContent += chunk
        setMessages(prev => {
          const updated = [...prev]
          const last    = updated[updated.length - 1]
          if (last.role === 'assistant') last.content = assistantContent
          return updated
        })
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        assistantContent += `\n\n**Erro:** ${
          error.message?.startsWith('Erro na API')
            ? 'Não foi possível conectar ao servidor.'
            : error.message
        }`
        setMessages(prev => {
          const updated = [...prev]
          const last    = updated[updated.length - 1]
          if (last.role === 'assistant') last.content = assistantContent
          return updated
        })
      }
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }

  const stopStreaming = () => { abortRef.current?.abort(); setIsStreaming(false) }
  const hasMessages   = messages.length > 0

  return (
    <div className="chat-container">
      {!hasMessages ? (
        <div className="chat-empty">
          <span className="chat-empty-globe">🌍</span>
          <h2>O que você quer saber sobre o cenário geopolítico?</h2>
          <p>Pergunte sobre conflitos, tensões internacionais, impactos econômicos e muito mais.</p>
          <div className="suggestions-grid">
            {SUGGESTIONS.map((s, i) => (
              <button key={i} className="suggestion-card" onClick={() => sendMessage(s.query)} disabled={isStreaming}>
                <span className="suggestion-icon">{s.icon}</span>
                <span className="suggestion-text">{s.text}</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <div className="messages-list">
          {messages.map((msg, i) => (
            <div key={i} className={`message-wrapper message-row ${msg.role === 'user' ? 'user' : 'assistant'}`}>
              {msg.role === 'user' ? (
                <div><div className="message-bubble">{msg.content}</div></div>
              ) : (
                <>
                  <div className="avatar">🌍</div>
                  <div className="message-bubble">
                    <div className="markdown-body">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>{msg.content}</ReactMarkdown>
                    </div>
                  </div>
                </>
              )}
            </div>
          ))}
          {isStreaming && (
            <div className="streaming-indicator">
              <div className="typing-dots"><span /><span /><span /></div>
              <span>Analisando fontes e gerando resposta...</span>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>
      )}

      <div className={`chat-input-area ${!hasMessages ? 'empty-state-input' : ''}`}>
        <div className="input-wrapper">
          <input
            type="text"
            className="chat-input"
            placeholder={hasMessages ? 'Pergunte sobre geopolítica...' : 'Faça uma pergunta...'}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
            disabled={isStreaming}
          />
          {isStreaming ? (
            <button className="input-button stop" onClick={stopStreaming}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <rect x="6" y="6" width="12" height="12" rx="2"/>
              </svg>
            </button>
          ) : (
            <button className="input-button send" onClick={() => sendMessage()} disabled={!input.trim()}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m22 2-7 20-4-9-9-4Z"/><path d="m22 2-11 11"/>
              </svg>
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
