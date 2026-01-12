// src/App.jsx
import React, { useState, useEffect } from 'react';
import io from 'socket.io-client';
import './App.css'; 

import { signInWithPopup, onAuthStateChanged, signOut } from "firebase/auth";
import { 
    doc, setDoc, getDoc, updateDoc, arrayUnion, onSnapshot, 
    collection, addDoc, query, orderBy 
} from "firebase/firestore"; 
import { auth, googleProvider, db } from "./firebase"; 

// Use Env variable or localhost
const BACKEND_URL = import.meta.env.VITE_SERVER_URL || 'http://localhost:3001';
const socket = io(BACKEND_URL);

function App() {
  const [user, setUser] = useState(null); 
  const [loading, setLoading] = useState(true); 
  const [showAddFriendModal, setShowAddFriendModal] = useState(false);
  
  const [friends, setFriends] = useState([]);
  const [friendRequests, setFriendRequests] = useState([]); 
  const [selectedUser, setSelectedUser] = useState(null);
  
  const [messages, setMessages] = useState({}); 
  const [currentMessage, setCurrentMessage] = useState("");

  const [targetEmail, setTargetEmail] = useState("");
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // --- 0. RESTORE SESSION ---
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (currentUser) => {
        if (currentUser) {
            try {
                const docRef = doc(db, "users", currentUser.email);
                const docSnap = await getDoc(docRef);
                let userProfile;
                if (docSnap.exists()) {
                    userProfile = docSnap.data();
                } else {
                    userProfile = {
                        email: currentUser.email,
                        nickname: currentUser.displayName || currentUser.email.split('@')[0],
                        avatar: currentUser.photoURL,
                        uid: currentUser.uid
                    };
                }
                setUser(userProfile);
                socket.emit('login_request', userProfile);
            } catch (err) {
                console.error("Session restore error:", err);
            }
        } else {
            setUser(null);
        }
        setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // --- 1. HANDLE LOGIN ---
  const handleGoogleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const u = result.user;
      const userProfile = {
        email: u.email,
        nickname: u.displayName || u.email.split('@')[0],
        avatar: u.photoURL,
        uid: u.uid
      };
      await setDoc(doc(db, "users", u.email), userProfile, { merge: true });
      socket.emit('login_request', userProfile);
      setUser(userProfile);
    } catch (err) {
      console.error(err);
      alert("Login Error: " + err.message);
    }
  };

  const handleLogout = () => {
      signOut(auth);
      setUser(null);
      setSelectedUser(null);
  };

  // --- 2. LISTEN TO DATA ---
  useEffect(() => {
    if (!user) return;
    const unsub = onSnapshot(doc(db, "users", user.email), async (docSnap) => {
        if (docSnap.exists()) {
            const data = docSnap.data();
            setFriendRequests(data.requests || []);
            const friendEmails = data.friends || [];
            if (friendEmails.length > 0) {
                const friendsData = [];
                for (const email of friendEmails) {
                    const fSnap = await getDoc(doc(db, "users", email));
                    if (fSnap.exists()) friendsData.push(fSnap.data());
                }
                setFriends(friendsData);
            } else {
                setFriends([]);
            }
        }
    });
    return () => unsub();
  }, [user]);

  // --- 3. ACTIONS ---
  const sendFriendRequest = async () => {
    if (!targetEmail.trim()) return;
    if (targetEmail === user.email) { setError("Can't add yourself."); return; }
    setError(""); setSuccessMsg("");
    try {
        const targetRef = doc(db, "users", targetEmail);
        const targetSnap = await getDoc(targetRef);
        if (!targetSnap.exists()) { setError("User does not exist yet."); return; }
        const targetData = targetSnap.data();
        if (targetData.friends?.includes(user.email)) { setError("Already friends."); return; }
        await updateDoc(targetRef, {
            requests: arrayUnion({ email: user.email, nickname: user.nickname, avatar: user.avatar })
        });
        setSuccessMsg("Request Sent!"); setTargetEmail("");
        setTimeout(() => setSuccessMsg(""), 3000);
    } catch (err) { setError("Error: " + err.message); }
  };

  const respondToRequest = async (requesterEmail, action) => {
    try {
        const myRef = doc(db, "users", user.email);
        const requesterRef = doc(db, "users", requesterEmail);
        const mySnap = await getDoc(myRef);
        const currentRequests = mySnap.data().requests || [];
        const updatedRequests = currentRequests.filter(r => r.email !== requesterEmail);
        await updateDoc(myRef, { requests: updatedRequests });
        if (action === 'accept') {
            await updateDoc(myRef, { friends: arrayUnion(requesterEmail) });
            await updateDoc(requesterRef, { friends: arrayUnion(user.email) });
        }
    } catch (err) { alert("Error: " + err.message); }
  };

  const getChatId = (email1, email2) => [email1, email2].sort().join("_");

  useEffect(() => {
    if (!selectedUser || !user) return;
    const chatId = getChatId(user.email, selectedUser.email);
    const msgsRef = collection(db, "chats", chatId, "messages");
    const q = query(msgsRef, orderBy("createdAt", "asc"));
    const unsub = onSnapshot(q, (snapshot) => {
        const loadedMsgs = snapshot.docs.map(doc => ({
            text: doc.data().text,
            isMe: doc.data().senderEmail === user.email
        }));
        setMessages(prev => ({ ...prev, [selectedUser.email]: loadedMsgs }));
    });
    return () => unsub();
  }, [selectedUser, user]);

  const sendMessage = async () => {
    if (!currentMessage.trim() || !selectedUser) return;
    const chatId = getChatId(user.email, selectedUser.email);
    const msgsRef = collection(db, "chats", chatId, "messages");
    try {
        await addDoc(msgsRef, {
            text: currentMessage,
            senderEmail: user.email,
            createdAt: new Date()
        });
        setCurrentMessage("");
    } catch (err) { console.error("Error sending message:", err); }
  };


  // --- RENDER ---
  if (loading) {
      return <div style={{height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#0f172a', color: 'white', fontSize: '1.5rem'}}>Loading ChatVerse...</div>;
  }

  if (user) {
    return (
      // NEW: Added 'mobile-chat-open' class conditionally
      <div className={`chat-app ${selectedUser ? 'mobile-chat-open' : ''}`}>
        
        {/* SIDEBAR */}
        <div className="sidebar">
          <div className="sidebar-header">
            <div style={{display:'flex', alignItems:'center'}}>
                <img src={user.avatar} alt="Me" className="user-avatar" referrerPolicy="no-referrer" />
                <div style={{marginLeft:'10px'}}>
                    <div style={{fontWeight: 'bold'}}>{user.nickname}</div>
                    <button onClick={handleLogout} style={{background:'none', border:'none', color:'#ef4444', cursor:'pointer', fontSize:'0.8rem', padding:'0'}}>Log Out</button>
                </div>
            </div>
            <button className="btn-icon" onClick={() => setShowAddFriendModal(true)}>➕</button>
          </div>

          {friendRequests.length > 0 && (
            <div className="requests-section">
                <div className="section-title">Friend Requests</div>
                {friendRequests.map((req, i) => (
                    <div key={i} className="request-item">
                        <img src={req.avatar} className="user-avatar-small" referrerPolicy="no-referrer" />
                        <div style={{flex:1, marginLeft:'10px'}}><div className="req-name">{req.nickname}</div></div>
                        <button className="btn-accept" onClick={() => respondToRequest(req.email, 'accept')}>✓</button>
                        <button className="btn-reject" onClick={() => respondToRequest(req.email, 'reject')}>✕</button>
                    </div>
                ))}
            </div>
          )}

          <div className="search-container"><input type="text" placeholder="Search friends..." className="search-input" /></div>

          <div className="contact-list">
            {friends.map((friend, index) => (
                <div key={index} 
                  className={`contact-item ${selectedUser?.email === friend.email ? 'active-chat' : ''}`}
                  onClick={() => setSelectedUser(friend)}
                >
                  <img src={friend.avatar} alt="User" className="user-avatar" referrerPolicy="no-referrer" />
                  <div className="contact-info">
                    <div className="contact-name">{friend.nickname}</div>
                    <div className="contact-status">Friend</div>
                  </div>
                </div>
            ))}
          </div>
        </div>

        {/* CHAT WINDOW */}
        <div className="chat-window">
           {selectedUser ? (
             <>
               <div className="chat-header">
                  {/* NEW: Back Button (Only visible on mobile via CSS) */}
                  <button className="btn-back" onClick={() => setSelectedUser(null)}>←</button>
                  
                  <img src={selectedUser.avatar} className="user-avatar" referrerPolicy="no-referrer" />
                  <div className="contact-info">
                    <div className="contact-name">{selectedUser.nickname}</div>
                    <div className="contact-status">{selectedUser.email}</div>
                  </div>
               </div>

               <div className="chat-messages">
                 {(messages[selectedUser.email] || []).map((msg, index) => (
                    <div key={index} className={`message-bubble ${msg.isMe ? 'my-message' : 'their-message'}`}>{msg.text}</div>
                 ))}
               </div>

               <div className="chat-input-area">
                 <input type="text" placeholder="Type a message" className="message-input"
                    value={currentMessage} onChange={(e) => setCurrentMessage(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && sendMessage()}
                 />
                 <button className="btn-primary" style={{padding:'10px 20px', borderRadius:'50%'}} onClick={sendMessage}>➤</button>
               </div>
             </>
           ) : (
             <div style={{display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', flexDirection: 'column', color: '#8696a0'}}>
                <h2>Welcome, {user.nickname}</h2>
             </div>
           )}
        </div>

        {/* MODAL */}
        {showAddFriendModal && (
            <div className="modal-overlay">
                <div className="modal-content" style={{background: '#1e293b', color:'white'}}>
                    <h2>Add Friend</h2>
                    <input type="email" placeholder="friend@gmail.com" className="nickname-input"
                        value={targetEmail} onChange={(e) => setTargetEmail(e.target.value)} />
                    {error && <p style={{color:'red'}}>{error}</p>}
                    {successMsg && <p style={{color:'green'}}>{successMsg}</p>}
                    <div className="modal-actions">
                        <button className="btn-cancel" onClick={() => setShowAddFriendModal(false)}>Close</button>
                        <button className="btn-primary" onClick={sendFriendRequest}>Send</button>
                    </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className="App">
      <nav><div className="logo">ChatVerse</div><div className="nav-links"><button className="btn-primary" onClick={handleGoogleLogin}>Sign In</button></div></nav>
      <section className="hero"><div className="hero-content"><h1>Connect freely.</h1><button className="btn-primary" onClick={handleGoogleLogin}>Get Started</button></div></section>
    </div>
  );
}

export default App;