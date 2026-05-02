import React, { useState, useEffect, useRef } from 'react';
import { io } from 'socket.io-client';

// Connect to the backend server
const socket = io('https://kinda-private-studying-v2.onrender.com');

function ChatOverlay({ currentUser }) {
  const [contactsOpen, setContactsOpen] = useState(false);
  const [contacts, setContacts] = useState([]);
  const [activeChats, setActiveChats] = useState([]);
  const [inputValues, setInputValues] = useState({});
  const [unreadCounts, setUnreadCounts] = useState({}); 
  
  // State for the "Add Contact" input form
  const [searchQuery, setSearchQuery] = useState('');
  const [addingContact, setAddingContact] = useState(false);
  const [newContactName, setNewContactName] = useState('');

  // Which contact the user has clicked the delete button for (triggers the confirmation modal)
  const [contactToDelete, setContactToDelete] = useState(null);

  const messagesEndRef = useRef(null);
  
  // Keep a ref to activeChats so the socket event handlers always see the latest value
  const activeChatsRef = useRef(activeChats);
  useEffect(() => {
    activeChatsRef.current = activeChats;
  }, [activeChats]);

  // Set up all socket event listeners when the component mounts
  useEffect(() => {
    if (currentUser) {
      // Tell the server who we are so it can route messages to us
      socket.emit('identify', currentUser);
    }

    // Receive updated contact/channel list from the server
    socket.on('roster_data', (data) => {
      setContacts(data);
      // If a chat tab is open for a channel that no longer exists, close it
      const currentChannelIds = data.map(c => c.id);
      setActiveChats(prev => prev.filter(c => currentChannelIds.includes(c.id)));
    });

    // Load message history when opening a channel
    socket.on('channel_history', (history) => {
      if (history.length > 0) {
        const channelId = history[0].channelId;
        setActiveChats(prev => prev.map(chat =>
          chat.id === channelId ? { ...chat, messages: history } : chat
        ));
      }
    });

    // Handle an incoming message — add it to the correct chat and track unread count if minimized
    socket.on('chat_message', (msg) => {
      const chat = activeChatsRef.current.find(c => c.id === msg.channelId);
      const isVisible = chat && !chat.isMinimized;

      if (!isVisible) {
        setUnreadCounts(prev => ({
          ...prev,
          [msg.channelId]: (prev[msg.channelId] || 0) + 1
        }));
      }

      setActiveChats(prev => prev.map(c =>
        c.id === msg.channelId
          ? { ...c, messages: [...c.messages, msg] }
          : c
      ));
    });

    return () => {
      socket.off('roster_data');
      socket.off('channel_history');
      socket.off('chat_message');
    };
  }, [currentUser]);

  // Auto-scroll to the latest message whenever new messages come in
  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeChats]);

  const toggleContacts = () => setContactsOpen(prev => !prev);

  // Mark a channel's messages as read (clears the unread badge)
  const markAsRead = (channelId) => {
    setUnreadCounts(prev => {
      const updated = { ...prev };
      delete updated[channelId];
      return updated;
    });
  };

  // Open a chat window for a channel, or un-minimize it if already open
  const openChat = (channel) => {
    setActiveChats(prev => {
      const exists = prev.find(c => c.id === channel.id);
      if (exists) {
        return prev.map(c => c.id === channel.id ? { ...c, isMinimized: false } : c);
      }
      return [...prev, { ...channel, messages: [], isMinimized: false }];
    });
    markAsRead(channel.id);
    socket.emit('select_channel', channel.id); 
    if (!contactsOpen) setContactsOpen(true);
  };

  const toggleMinimize = (channelId) => {
    setActiveChats(prev => prev.map(c => {
      if (c.id === channelId) {
        const isMin = !c.isMinimized;
        if (!isMin) markAsRead(channelId); // Mark as read when expanding
        return { ...c, isMinimized: isMin };
      }
      return c;
    }));
  };

  const closeChat = (channelId) => {
    setActiveChats(prev => prev.filter(c => c.id !== channelId));
  };

  // Send a message in a chat window
  const handleSend = (channelId) => {
    const text = inputValues[channelId];
    if (!text || !text.trim()) return;

    // Switch to the correct channel first, then send after a short delay to ensure it's registered
    socket.emit('select_channel', channelId);
    
    setTimeout(() => {
      socket.emit('chat_message', { msg: text.trim() });
    }, 50);

    setInputValues(prev => ({ ...prev, [channelId]: '' }));
  };

  // Submit the add-contact form
  const submitNewContact = () => {
    if (!newContactName.trim()) return;
    socket.emit('add_contact', newContactName.trim());
    setNewContactName('');
    setAddingContact(false);
  };

  // Confirm and delete the selected contact
  const confirmDelete = () => {
    if (contactToDelete) {
      socket.emit('remove_contact', contactToDelete.id);
      closeChat(contactToDelete.id); // Also close the chat tab if it's currently open
      setContactToDelete(null);
    }
  };

  // Format a timestamp as HH:MM
  const formatTimestamp = (isoString) => {
    const date = new Date(isoString);
    return `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
  };

  const filteredContacts = contacts.filter(channel => 
    channel.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const totalUnread = Object.values(unreadCounts).reduce((sum, count) => sum + count, 0);

  return (
    <>
      {/* DELETE CONFIRMATION MODAL — rendered at the top level so it dims the entire screen */}
      {contactToDelete && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          background: 'rgba(0, 0, 0, 0.75)', zIndex: 10000,
          display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'auto',
          backdropFilter: 'blur(2px)'
        }}>
          <div style={{
            background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px',
            padding: '24px', width: '320px', display: 'flex', flexDirection: 'column', gap: '16px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)'
          }}>
            <h3 style={{ margin: 0, color: 'var(--text)', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ color: '#ed4245' }}>⚠</span> Warning
            </h3>
            <p style={{ margin: 0, color: 'var(--text-muted)', fontSize: '13px', lineHeight: 1.5 }}>
              Are you sure you want to delete <strong style={{color: 'var(--text)'}}>{contactToDelete.name}</strong> from your contacts list? 
              This will permanently delete the messages between you two and even I (chad) can't help you with it.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '8px' }}>
              <button 
                onClick={() => setContactToDelete(null)}
                style={{ background: 'transparent', border: '1px solid var(--border)', color: 'var(--text)', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                CANCEL
              </button>
              <button 
                onClick={confirmDelete}
                style={{ background: '#ed4245', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: 600 }}
              >
                DELETE
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{
        position: 'fixed', bottom: 0, right: '20px', display: 'flex', flexDirection: 'row-reverse',
        alignItems: 'flex-end', gap: '12px', zIndex: 9999, pointerEvents: 'none',
      }}>
        
        {/* CONTACTS PANEL */}
        <div style={{ pointerEvents: 'auto' }}>
          {contactsOpen ? (
            <div style={{
              width: '280px', height: '420px', background: 'var(--card)', border: '1px solid var(--border)',
              borderBottom: 'none', borderRadius: '8px 8px 0 0', display: 'flex', flexDirection: 'column',
              boxShadow: 'var(--shadow)',
            }}>
              <div 
                onClick={toggleContacts}
                style={{
                  padding: '12px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)',
                  borderRadius: '8px 8px 0 0', cursor: 'pointer', display: 'flex', justifyContent: 'space-between',
                  alignItems: 'center',
                }}
              >
                <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>Network Channels</span>
                <span style={{ color: 'var(--text-muted)' }}>▼</span>
              </div>
              
              <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }}>
                {contacts.length === 0 && <div style={{ padding: '10px', fontSize: '12px', color: 'var(--text-muted)' }}>Loading contacts...</div>}
                {filteredContacts.map(channel => (
                  <div 
                    key={channel.id}
                    style={{
                      display: 'flex', alignItems: 'center', padding: '10px',
                      borderRadius: '4px', transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <div 
                      onClick={() => openChat(channel)}
                      style={{ flex: 1, display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer' }}
                    >
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#43b581' }} />
                      <span style={{ fontSize: '13px', color: 'var(--text)', fontWeight: 600 }}>{channel.name}</span>
                      {unreadCounts[channel.id] > 0 && (
                        <span style={{ marginLeft: 'auto', fontSize: '11px', background: '#ed4245', color: '#fff', padding: '2px 6px', borderRadius: '12px', fontWeight: 700 }}>
                          {unreadCounts[channel.id]}
                        </span>
                      )}
                    </div>
                    
                    {/* Only show the delete button for direct message contacts (not public channels) */}
                    {channel.name.startsWith('@') && (
                      <button 
                        onClick={() => setContactToDelete(channel)}
                        style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '16px', cursor: 'pointer', padding: '0 4px', marginLeft: '8px' }}
                        title="Remove Contact"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Add contact input — only shown when the + button is clicked */}
              {addingContact && (
                <div style={{ padding: '10px 12px', background: 'var(--surface)', borderTop: '1px solid var(--border)', display: 'flex', gap: '8px' }}>
                  <input 
                    autoFocus
                    placeholder="Enter username..."
                    value={newContactName}
                    onChange={e => setNewContactName(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && submitNewContact()}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: '4px', border: '1px solid var(--accent)', background: 'var(--card)', color: 'var(--text)', fontSize: '12px', outline: 'none' }}
                  />
                  <button 
                    onClick={submitNewContact}
                    style={{ padding: '8px 12px', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: '#131313', fontSize: '12px', fontWeight: 700 }}
                  >
                    ADD
                  </button>
                </div>
              )}

              <div style={{ padding: '10px', borderTop: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', gap: '8px', borderRadius: '0 0 0 0' }}>
                <button 
                  onClick={() => setAddingContact(!addingContact)}
                  style={{ 
                    width: '34px', height: '34px', borderRadius: '4px', background: addingContact ? 'var(--accent-dim)' : 'var(--accent)', 
                    border: addingContact ? '1px solid var(--border)' : 'none', color: addingContact ? 'var(--text-muted)' : '#131313', 
                    fontSize: '18px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
                  }}
                >
                  {addingContact ? '×' : '+'}
                </button>
                <input 
                  placeholder="Search contacts..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  style={{ flex: 1, padding: '8px 12px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--card)', color: 'var(--text)', fontSize: '12px', outline: 'none' }}
                />
              </div>

            </div>
          ) : (
            // Collapsed contacts button — shows total unread count if there are unread messages
            <div 
              onClick={toggleContacts}
              style={{
                padding: '12px 24px', background: 'var(--card)', border: '1px solid var(--border)', borderBottom: 'none',
                borderRadius: '8px 8px 0 0', cursor: 'pointer', boxShadow: 'var(--shadow)', display: 'flex', alignItems: 'center', gap: '8px',
              }}
            >
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--accent)' }}>Contacts</span>
              <span style={{ fontSize: '12px', background: totalUnread > 0 ? '#ed4245' : 'var(--accent)', color: totalUnread > 0 ? '#fff' : '#131313', padding: '2px 6px', borderRadius: '12px', fontWeight: 700 }}>
                {totalUnread > 0 ? totalUnread : contacts.length}
              </span>
            </div>
          )}
        </div>

        {/* OPEN CHAT WINDOWS — rendered as floating panels to the left of the contacts panel */}
        {activeChats.map(chat => {
          // Minimized chat: just a slim bar showing the name and unread count
          if (chat.isMinimized) {
            return (
              <div 
                key={chat.id} 
                onClick={() => toggleMinimize(chat.id)}
                style={{
                  minWidth: '160px', maxWidth: '220px', height: '42px', background: 'var(--surface)', border: '1px solid var(--border)',
                  borderBottom: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer', boxShadow: 'var(--shadow)', pointerEvents: 'auto',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 12px', gap: '8px', transition: 'background 0.2s',
                }}
                onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'}
                onMouseLeave={e => e.currentTarget.style.background = 'var(--surface)'}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', overflow: 'hidden' }}>
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {chat.name}
                  </span>
                  {unreadCounts[chat.id] > 0 && (
                    <span style={{ fontSize: '11px', background: '#ed4245', color: '#fff', padding: '2px 6px', borderRadius: '12px', fontWeight: 700 }}>
                      {unreadCounts[chat.id]}
                    </span>
                  )}
                </div>
                <button 
                  onClick={(e) => { e.stopPropagation(); closeChat(chat.id); }}
                  style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '18px', display: 'flex', alignItems: 'center', cursor: 'pointer' }}
                >
                  ×
                </button>
              </div>
            );
          }

          // Full chat window
          return (
            <div key={chat.id} style={{
              width: '320px', height: '420px', background: 'var(--card)', border: '1px solid var(--border)', borderBottom: 'none',
              borderRadius: '8px 8px 0 0', display: 'flex', flexDirection: 'column', boxShadow: 'var(--shadow)', pointerEvents: 'auto',
            }}>
              {/* Chat header with minimize and close buttons */}
              <div style={{
                padding: '10px 16px', background: 'var(--surface)', borderBottom: '1px solid var(--border)', borderRadius: '8px 8px 0 0',
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{chat.name}</span>
                <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                  <button 
                    onClick={() => toggleMinimize(chat.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '16px', fontWeight: 700, cursor: 'pointer' }}
                    title="Minimize"
                  >
                    —
                  </button>
                  <button 
                    onClick={() => closeChat(chat.id)}
                    style={{ background: 'transparent', border: 'none', color: 'var(--text-muted)', fontSize: '20px', lineHeight: 1, cursor: 'pointer' }}
                    title="Close"
                  >
                    ×
                  </button>
                </div>
              </div>
              
              {/* Message list */}
              <div style={{ flex: 1, padding: '12px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {chat.messages.length === 0 && <div style={{ textAlign: 'center', fontSize: '11px', color: 'var(--text-muted)', marginTop: '20px' }}>No messages yet.</div>}
                
                {chat.messages.map((msg, idx) => {
                  const isMe = msg.user === currentUser;
                  return (
                    <div key={idx} style={{
                      display: 'flex', flexDirection: 'column', alignItems: isMe ? 'flex-end' : 'flex-start', width: '100%',
                    }}>
                      <div style={{ fontSize: '10px', color: 'var(--text-muted)', marginBottom: '4px', padding: '0 4px' }}>
                        {isMe ? 'You' : msg.user} • {formatTimestamp(msg.timestamp)}
                      </div>
                      <div style={{
                        background: isMe ? 'var(--accent)' : 'var(--surface)', color: isMe ? '#131313' : 'var(--text)',
                        padding: '8px 12px', borderRadius: '6px', fontSize: '12px', maxWidth: '85%', wordWrap: 'break-word',
                        border: isMe ? 'none' : '1px solid var(--border)',
                      }}>
                        {msg.msg}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              {/* Message input */}
              <div style={{ padding: '12px', borderTop: '1px solid var(--border)', background: 'var(--surface)' }}>
                <input 
                  placeholder={`Message ${chat.name}...`}
                  value={inputValues[chat.id] || ''}
                  onChange={e => setInputValues(prev => ({ ...prev, [chat.id]: e.target.value }))}
                  onKeyDown={e => e.key === 'Enter' && handleSend(chat.id)}
                  style={{
                    width: '100%', padding: '10px', borderRadius: '4px', border: '1px solid var(--border)', background: 'var(--card)',
                    color: 'var(--text)', fontSize: '12px', outline: 'none', fontFamily: 'Inter, sans-serif'
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </>
  );
}

export default ChatOverlay;
