// src/components/ChatRoom.jsx
import React, { useRef, useState } from 'react';

// Firebase SDK and Hooks
import { db, auth } from '../firebase';
import { collection, query, orderBy, limit, addDoc, serverTimestamp } from 'firebase/firestore';
import { useCollectionData } from 'react-firebase-hooks/firestore';

export default function ChatRoom() {
  // 1. Reference the 'messages' collection in the database
  const messagesRef = collection(db, 'messages');
  
  // 2. Create a query: Order by time, limit to last 25 messages
  const q = query(messagesRef, orderBy('createdAt'), limit(25));

  // 3. Listen to the data in real-time
  const [messages] = useCollectionData(q, { idField: 'id' });

  // Helper for auto-scrolling
  const dummy = useRef();
  const [formValue, setFormValue] = useState('');

  const sendMessage = async (e) => {
    e.preventDefault();
    if (!formValue.trim()) return; // Don't send empty messages

    const { uid, photoURL } = auth.currentUser;

    // 4. Add a new document to Firebase
    await addDoc(messagesRef, {
      text: formValue,
      createdAt: serverTimestamp(),
      uid,
      photoURL
    });

    setFormValue('');
    // Scroll to bottom
    dummy.current.scrollIntoView({ behavior: 'smooth' });
  }

  return (
    <>
      <main className="chat-main">
        {/* Map through the real messages from Firebase */}
        {messages && messages.map(msg => <ChatMessage key={msg.id} message={msg} />)}
        
        {/* Invisible element to scroll to */}
        <span ref={dummy}></span>
      </main>

      <form onSubmit={sendMessage} className="chat-form">
        <input 
          value={formValue} 
          onChange={(e) => setFormValue(e.target.value)} 
          placeholder="Say something nice" 
        />
        <button type="submit" disabled={!formValue}>🕊️</button>
      </form>
    </>
  )
}

function ChatMessage(props) {
  const { text, uid, photoURL } = props.message;

  // Check if the message was sent by the current user
  const messageClass = uid === auth.currentUser.uid ? 'sent' : 'received';

  return (
    <div className={`message ${messageClass}`}>
      <img src={photoURL || 'https://i.pravatar.cc/300'} alt="Avatar" />
      <p>{text}</p>
    </div>
  )
}