// server.js
import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
app.use(cors());
app.use(express.json());

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: ["http://localhost:5173", "http://localhost:3000", "https://chatverse-app.vercel.app"], 
    methods: ["GET", "POST"]
  }
});

// --- MEMORY DATABASE ---
// Stores persistent user data: friends, requests, avatar, etc.
// Key = Email
// Value = { email, nickname, avatar, friends: [], requests: [] }
let usersDB = {}; 

// Maps Socket ID -> Email (to know who is currently online)
let activeSockets = {}; 

io.on('connection', (socket) => {
  console.log('New socket connected:', socket.id);

  // --- 1. LOGIN ---
  socket.on('login_request', (userData) => {
    if (!userData || !userData.email) return;

    const email = userData.email;
    
    // Create account in Memory DB if not exists
    if (!usersDB[email]) {
        usersDB[email] = {
            email: email,
            nickname: userData.nickname || email.split('@')[0],
            avatar: userData.avatar || "/default-avatar.png",
            friends: [],   // List of emails
            requests: []   // List of incoming email requests
        };
    } else {
        // Update avatar/nickname on login if changed
        usersDB[email].avatar = userData.avatar || usersDB[email].avatar;
        usersDB[email].nickname = userData.nickname || usersDB[email].nickname;
    }

    // Mark as Online
    activeSockets[socket.id] = email;
    socket.join(email); // Join a specific "Room" named after their email for easy private messaging

    // Send the user their own profile + friends + requests
    const myData = usersDB[email];
    
    // We need to send full objects for friends, not just emails
    const enrichedFriends = myData.friends.map(friendEmail => ({
        ...usersDB[friendEmail],
        isOnline: Object.values(activeSockets).includes(friendEmail)
    }));

    // Send back to client
    socket.emit('login_success', {
        ...myData,
        friends: enrichedFriends
    });

    // Notify friends that I am online
    myData.friends.forEach(friendEmail => {
        // Find friend's socket (if online) and tell them
        // In a real app, we'd emit to the 'room' of that friend
        // For now, simpler:
        // We trigger a refresh for them if they are connected
    });
  });

  // --- 2. SEND FRIEND REQUEST ---
  socket.on('send_friend_request', (targetEmail) => {
    const senderEmail = activeSockets[socket.id];
    if (!senderEmail) return;

    // Validation
    if (senderEmail === targetEmail) {
        socket.emit('request_error', "You cannot add yourself.");
        return;
    }
    if (!usersDB[targetEmail]) {
        socket.emit('request_error', "User not found. They must sign in at least once.");
        return;
    }
    if (usersDB[targetEmail].requests.includes(senderEmail)) {
        socket.emit('request_error', "Request already sent.");
        return;
    }
    if (usersDB[targetEmail].friends.includes(senderEmail)) {
        socket.emit('request_error', "User is already your friend.");
        return;
    }

    // Add to target's request list
    usersDB[targetEmail].requests.push(senderEmail);

    // Notify the Target immediately (if online)
    // We send the full sender profile so they see the avatar
    const senderProfile = usersDB[senderEmail];
    io.to(targetEmail).emit('new_friend_request', senderProfile);

    socket.emit('request_sent', "Friend request sent!");
  });

  // --- 3. RESPOND TO REQUEST (Accept/Reject) ---
  socket.on('respond_friend_request', ({ requesterEmail, action }) => {
    const myEmail = activeSockets[socket.id];
    if (!myEmail) return;

    // Remove from requests list
    usersDB[myEmail].requests = usersDB[myEmail].requests.filter(e => e !== requesterEmail);

    if (action === 'accept') {
        // Add to both friend lists
        if (!usersDB[myEmail].friends.includes(requesterEmail)) {
            usersDB[myEmail].friends.push(requesterEmail);
        }
        if (!usersDB[requesterEmail].friends.includes(myEmail)) {
            usersDB[requesterEmail].friends.push(myEmail);
        }

        // Notify ME (Update my UI)
        const newFriend = usersDB[requesterEmail];
        socket.emit('friend_added', { 
            ...newFriend, 
            isOnline: Object.values(activeSockets).includes(requesterEmail) 
        });

        // Notify THEM (Update their UI)
        const me = usersDB[myEmail];
        io.to(requesterEmail).emit('friend_added', {
            ...me,
            isOnline: true
        });
    }

    // Send updated request list (empty now)
    // (Optional, simpler to just handle locally)
  });

  // --- 4. PRIVATE MESSAGES ---
  socket.on('private_message', ({ toEmail, message }) => {
    const senderEmail = activeSockets[socket.id];
    
    // Send to specific email room
    io.to(toEmail).emit('private_message', {
        senderEmail: senderEmail,
        text: message,
        timestamp: new Date().toISOString()
    });
  });

  // --- DISCONNECT ---
  socket.on('disconnect', () => {
    const email = activeSockets[socket.id];
    if (email) {
        console.log('User disconnected:', email);
        delete activeSockets[socket.id];
        // Note: We don't delete them from usersDB so friends are saved!
    }
  });
});

const PORT = 3001;
server.listen(PORT, () => {
  console.log(`SERVER RUNNING on http://localhost:${PORT}`);
});