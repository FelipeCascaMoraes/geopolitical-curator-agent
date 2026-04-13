import { useState, useCallback, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatTab from './components/ChatTab'
import NewsTab from './components/NewsTab'

const API_BASE = 'http://localhost:8000'

interface HistoryItem {
  id: string
  question: string
  timestamp: Date
}

export default function App() {
  const [activeTab, setActiveTab]     = useState<'chat' | 'news'>('news')
  const [apiConnected, setApiConnected] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [chatHistory, setChatHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('geo_chat_history')
      if (!saved) return []
      return JSON.parse(saved).map((item: any) => ({
        ...item,
        timestamp: new Date(item.timestamp),
      }))
    } catch { return [] }
  })
  const [pendingQuestion, setPendingQuestion] = useState<string | null>(null)

  const checkApi = useCallback(async () => {
    try {
      await fetch(`${API_BASE}/api/health`)
      setApiConnected(true)
    } catch {
      setApiConnected(false)
    }
  }, [])

  useEffect(() => {
    checkApi()
    const interval = setInterval(checkApi, 30000)
    return () => clearInterval(interval)
  }, [checkApi])

  // Persiste histórico no localStorage
  useEffect(() => {
    try {
      localStorage.setItem('geo_chat_history', JSON.stringify(chatHistory))
    } catch {}
  }, [chatHistory])

  const addToHistory = useCallback((question: string) => {
    setChatHistory(prev => {
      // Evita duplicatas consecutivas
      if (prev.length > 0 && prev[0].question === question) return prev
      const item: HistoryItem = {
        id:        Date.now().toString(),
        question:  question.length > 60 ? question.slice(0, 60) + '…' : question,
        timestamp: new Date(),
      }
      return [item, ...prev].slice(0, 20) // máx 20 itens
    })
  }, [])

  const handleHistorySelect = useCallback((item: HistoryItem) => {
    setPendingQuestion(item.question)
    setActiveTab('chat')
    setSidebarOpen(false)
  }, [])

  const handleHistoryClear = useCallback(() => {
    setChatHistory([])
  }, [])

  return (
    <div className="app-layout">
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <line x1="3" y1="6" x2="21" y2="6"/>
          <line x1="3" y1="12" x2="21" y2="12"/>
          <line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setSidebarOpen(false) }}
        apiConnected={apiConnected}
        chatHistory={chatHistory}
        onHistorySelect={handleHistorySelect}
        onHistoryClear={handleHistoryClear}
      />

      <main className="main-content">
        {activeTab === 'chat'
          ? <ChatTab
              onMessageSent={addToHistory}
              pendingQuestion={pendingQuestion}
              onPendingConsumed={() => setPendingQuestion(null)}
            />
          : <NewsTab />
        }
      </main>
    </div>
  )
}
