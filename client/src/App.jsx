import React, { useState, useEffect, useRef } from 'react';
import axios from 'axios';
import io from 'socket.io-client';
import './App.css';

axios.defaults.withCredentials = true;
const BACKEND_URL = 'http://localhost:5000';

export default function App() {
  const [user, setUser] = useState(null);
  const [isLogin, setIsLogin] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  
  const [users, setUsers] = useState([]);
  const [search, setSearch] = useState('');
  const [selectedUser, setSelectedUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState('');
  const [onlineCount, setOnlineCount] = useState(1);
  const [unreads, setUnreads] = useState({});
  const [socket, setSocket] = useState(null);

  const messagesEndRef = useRef(null);
  const selectedUserRef = useRef(selectedUser);

  useEffect(() => {
    selectedUserRef.current = selectedUser;
  }, [selectedUser]);

  // Check login on load
  useEffect(() => {
    axios.get(`${BACKEND_URL}/api/auth/me`)
      .then(res => setUser(res.data))
      .catch(() => setUser(null));
  }, []);

  // Fetch all users function
  const fetchUsers = () => {
    axios.get(`${BACKEND_URL}/api/auth/users`).then(res => setUsers(res.data)).catch(() => {});
  };

  // Connect Socket when user logged in
  useEffect(() => {
    if (!user) return;
    const newSocket = io(BACKEND_URL, { withCredentials: true });
    setSocket(newSocket);

    fetchUsers();

    newSocket.on('online:count', (count) => {
      setOnlineCount(count);
      fetchUsers(); // Refresh user list when online count changes
    });

    newSocket.emit('chat:unread');
    newSocket.on('chat:unread', (data) => {
      const map = {};
      data.forEach(item => { map[item.userId] = item.count; });
      setUnreads(map);
    });

    newSocket.on('chat:unread:update', ({ userId, count }) => {
      setUnreads(prev => ({ ...prev, [userId]: count }));
    });

    newSocket.on('chat:history', (msgs) => setMessages(msgs));

    newSocket.on('chat:message', (msg) => {
      const activeChat = selectedUserRef.current;
      if (activeChat && (msg.sender === activeChat._id || msg.receiver === activeChat._id)) {
        setMessages(prev => [...prev, msg]);
      }
    });

    return () => newSocket.close();
  }, [user]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleAuth = async (e) => {
    e.preventDefault();
    const endpoint = isLogin ? '/api/auth/login' : '/api/auth/register';
    const payload = isLogin ? { email, password } : { name, email, password };
    try {
      const res = await axios.post(`${BACKEND_URL}${endpoint}`, payload);
      setUser(res.data.user);
    } catch (err) {
      alert(err.response?.data?.message || 'Error occurred');
    }
  };

  const handleLogout = async () => {
    await axios.post(`${BACKEND_URL}/api/auth/logout`);
    setUser(null);
    setSelectedUser(null);
  };

  const selectChatUser = (u) => {
    setSelectedUser(u);
    if (socket) {
      socket.emit('chat:history', u._id);
      socket.emit('chat:read', u._id);
    }
  };

  const sendMessage = (e) => {
    e.preventDefault();
    if (!text.trim() || !selectedUser || !socket) return;
    socket.emit('chat:send', { to: selectedUser._id, text });
    setText('');
  };

  const filteredUsers = users.filter(u => 
    u.name.toLowerCase().includes(search.toLowerCase())
  );

  if (!user) {
    return (
      <div className="app-container">
        <div className="auth-card">
          <div className="avatar-circle">{isLogin ? 'C' : 'R'}</div>
          <h2>{isLogin ? 'ChatApp Login' : 'Register Account'}</h2>
          <p style={{ color: '#666', fontSize: '12px', marginBottom: '15px' }}>
            {isLogin ? 'Login to start chatting' : 'Create your chat account'}
          </p>
          <form onSubmit={handleAuth}>
            {!isLogin && (
              <input type="text" placeholder="Full Name" value={name} onChange={e=>setName(e.target.value)} required />
            )}
            <input type="email" placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} required />
            <input type="password" placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} required />
            <button className="btn-primary" type="submit">{isLogin ? 'Login' : 'Register'}</button>
          </form>
          <p className="toggle-text" onClick={() => setIsLogin(!isLogin)}>
            {isLogin ? "No account? Register" : "Already have account? Login"}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="app-container">
      <div className="chat-window">
        {/* Sidebar */}
        <div className="sidebar">
          <div className="sidebar-header">
            <div className="user-info">
              <div className="user-avatar">{user.name ? user.name[0].toUpperCase() : 'U'}</div>
              <div>
                <div>{user.name}</div>
                <div className="online-badge">• Online: {onlineCount}</div>
              </div>
            </div>
            <button onClick={handleLogout} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#666' }}>Logout</button>
          </div>

          <div className="search-box">
            <input 
              type="text" 
              placeholder="Search user..." 
              value={search}
              onChange={e => setSearch(e.target.value)}
            />
          </div>

          <div className="user-list">
            {filteredUsers.map(u => (
              <div key={u._id} className={`user-item ${selectedUser?._id === u._id ? 'active' : ''}`} onClick={() => selectChatUser(u)}>
                <div className="user-details">
                  <div className="user-avatar" style={{ background: '#6c757d' }}>{u.name[0].toUpperCase()}</div>
                  <div>
                    <div><strong>{u.name}</strong></div>
                    <div style={{ fontSize: '12px', color: '#888' }}>Click to chat</div>
                  </div>
                </div>
                {unreads[u._id] > 0 && (
                  <span className="badge">{unreads[u._id]}</span>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Chat Area */}
        <div className="chat-area">
          {selectedUser ? (
            <>
              <div className="chat-header">
                <div className="user-avatar" style={{ background: '#6c757d' }}>{selectedUser.name[0].toUpperCase()}</div>
                <div>
                  <strong>{selectedUser.name}</strong>
                  <div style={{ fontSize: '12px', color: '#666' }}>Online</div>
                </div>
              </div>

              <div className="messages-box">
                {messages.map((m, idx) => (
                  <div key={idx} className={`msg ${m.sender === user._id ? 'sent' : 'received'}`}>
                    <span>{m.text}</span>
                    <span className="msg-time">{new Date(m.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </div>

              <form className="input-area" onSubmit={sendMessage}>
                <input type="text" placeholder="Type a message" value={text} onChange={e => setText(e.target.value)} />
                <button className="send-btn" type="submit">➤</button>
              </form>
            </>
          ) : (
            <div className="empty-chat">
              <h2>WhatsApp Style Chat</h2>
              <p>Select a user from the left to start chatting.</p>
              <div style={{ marginTop: '10px' }} className="online-badge">Online users: {onlineCount}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}