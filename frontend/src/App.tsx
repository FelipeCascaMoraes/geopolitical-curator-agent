import { useState, useCallback, useEffect } from 'react'
import Sidebar from './components/Sidebar'
import ChatTab from './components/ChatTab'
import NewsTab from './components/NewsTab'

const API_BASE = 'http://localhost:8000'

export default function App() {
  const [activeTab, setActiveTab] = useState<'chat' | 'news'>('news')
  const [apiConnected, setApiConnected] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)

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

  return (
    <div className="app-layout">
      {/* Mobile toggle */}
      <button className="mobile-menu-btn" onClick={() => setSidebarOpen(!sidebarOpen)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/></svg>
      </button>

      {sidebarOpen && <div className="sidebar-backdrop" onClick={() => setSidebarOpen(false)} />}

      <Sidebar
        activeTab={activeTab}
        onTabChange={(tab) => { setActiveTab(tab); setSidebarOpen(false) }}
        apiConnected={apiConnected}
      />

      <main className="main-content">
        {activeTab === 'chat' ? <ChatTab /> : <NewsTab />}
      </main>
    </div>
  )
}
