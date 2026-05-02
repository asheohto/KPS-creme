import React, { useState, useEffect } from 'react';

// currentUser is required so each user's notes are saved separately in localStorage
function Notepad({ currentUser }) {
  // Storage keys are tied to the logged-in user so notes don't bleed between accounts
  const CACHE_KEY_TABS = `nova_notepad_tabs_${currentUser}`;
  const CACHE_KEY_ACTIVE = `nova_notepad_active_${currentUser}`;

  // Load saved tabs from localStorage on first render, or start with a blank default tab
  const [tabs, setTabs] = useState(() => {
    if (!currentUser) return [{ id: 1, title: 'Alpha', content: '' }];
    
    const saved = localStorage.getItem(CACHE_KEY_TABS);
    return saved ? JSON.parse(saved) : [{ id: 1, title: 'Alpha', content: '' }];
  });
  
  // Load the last active tab from localStorage, or default to the first tab
  const [activeTabId, setActiveTabId] = useState(() => {
    if (!currentUser) return 1;
    
    const saved = localStorage.getItem(CACHE_KEY_ACTIVE);
    return saved !== null ? parseInt(saved, 10) : 1;
  });

  // Save tabs and active tab to localStorage whenever they change
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(CACHE_KEY_TABS, JSON.stringify(tabs));
      localStorage.setItem(CACHE_KEY_ACTIVE, activeTabId.toString());
    }
  }, [tabs, activeTabId, currentUser, CACHE_KEY_TABS, CACHE_KEY_ACTIVE]);

  // Get the currently visible tab object
  const activeTab = tabs.find(t => t.id === activeTabId) || tabs[0];

  const handleContentChange = (e) => {
    const newContent = e.target.value;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, content: newContent } : t));
  };

  const handleTitleChange = (e) => {
    const newTitle = e.target.value;
    setTabs(prev => prev.map(t => t.id === activeTabId ? { ...t, title: newTitle } : t));
  };

  const addTab = () => {
    const newId = Date.now();
    setTabs(prev => [...prev, { id: newId, title: `untitled`, content: '' }]);
    setActiveTabId(newId);
  };

  const closeTab = (e, id) => {
    e.stopPropagation();
    if (tabs.length === 1) return; // Don't allow closing the last tab
    
    setTabs(prev => {
      const newTabs = prev.filter(t => t.id !== id);
      // If we closed the active tab, switch to the last remaining tab
      if (activeTabId === id) {
        setActiveTabId(newTabs[newTabs.length - 1].id);
      }
      return newTabs;
    });
  };

  return (
    <div style={{
      background: 'var(--card)',
      border: '1px solid var(--border)',
      borderRadius: '8px',
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      minHeight: '280px',
      overflow: 'hidden'
    }}>
      
      {/* TAB BAR */}
      <div style={{
        display: 'flex',
        background: 'var(--surface)',
        borderBottom: '1px solid var(--border)',
        overflowX: 'auto',
        scrollbarWidth: 'none',
      }}>
        {tabs.map(tab => (
          <div
            key={tab.id}
            onClick={() => setActiveTabId(tab.id)}
            style={{
              padding: '10px 14px',
              cursor: 'pointer',
              background: activeTabId === tab.id ? 'var(--card)' : 'transparent',
              borderRight: '1px solid var(--border)',
              borderBottom: activeTabId === tab.id ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: '10px',
              minWidth: '80px',
              justifyContent: 'space-between',
              transition: 'background 0.2s',
            }}
          >
            <span style={{ 
              fontSize: '12px', 
              fontWeight: activeTabId === tab.id ? 700 : 500,
              color: activeTabId === tab.id ? 'var(--text)' : 'var(--text-muted)', 
              whiteSpace: 'nowrap', 
              overflow: 'hidden', 
              textOverflow: 'ellipsis', 
              maxWidth: '100px' 
            }}>
              {tab.title || 'Untitled'}
            </span>
            {tabs.length > 1 && (
              <button
                onClick={(e) => closeTab(e, tab.id)}
                style={{ background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '14px', padding: 0, fontWeight: 700 }}
              >
                ×
              </button>
            )}
          </div>
        ))}
        <button
          onClick={addTab}
          style={{ 
            background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', 
            padding: '0 16px', fontSize: '18px', fontWeight: 700 
          }}
        >
          +
        </button>
      </div>

      {/* NOTE EDITOR — editable title at the top, free-text area below */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '16px', gap: '12px' }}>
        <input
          value={activeTab.title}
          onChange={handleTitleChange}
          placeholder="Note title..."
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text)',
            fontSize: '14px',
            fontWeight: 700,
            outline: 'none',
            width: '100%',
            fontFamily: 'Inter, sans-serif'
          }}
        />
        <textarea
          value={activeTab.content}
          onChange={handleContentChange}
          placeholder="Start typing..."
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            fontSize: '13px',
            outline: 'none',
            resize: 'none',
            fontFamily: 'Inter, sans-serif',
            width: '100%',
            lineHeight: 1.5
          }}
        />
      </div>
    </div>
  );
}

export default Notepad;
