import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import jwt from 'jsonwebtoken';

import authRoutes from './routes/authRoutes.js';
import User from './models/User.js';
import Message from './models/Message.js';

dotenv.config();

const app = express();
const server = http.createServer(app);

app.use(express.json());
app.use(cookieParser());
app.use(cors({
  origin: process.env.CLIENT_URL || 'http://localhost:5173',
  credentials: true
}));

app.use('/api/auth', authRoutes);

// Socket IO Setup[span_6](start_span)[span_6](end_span)
const io = new Server(server, {
  cors: {
    origin: process.env.CLIENT_URL || 'http://localhost:5173',
    credentials: true
  }
});

// Map to track online users: userId -> Set of socketIds
const onlineUsers = new Map();

// Helper: Parse cookie from handshake header
const getUserIdFromSocket = (socket) => {
  const cookieHeader = socket.handshake.headers.cookie;
  if (!cookieHeader) return null;
  const cookies = Object.fromEntries(cookieHeader.split('; ').map(c => c.split('=')));
  if (!cookies.token) return null;
  try {
    const decoded = jwt.verify(cookies.token, process.env.JWT_SECRET);
    return decoded.userId;
  } catch (e) {
    return null;
  }
};

io.on('connection', async (socket) => {
  const userId = getUserIdFromSocket(socket);
  if (!userId) {
    socket.disconnect();
    return;
  }

  socket.userId = userId;

  if (!onlineUsers.has(userId)) {
    onlineUsers.set(userId, new Set());
  }
  onlineUsers.get(userId).add(socket.id);

  // Emit online user count[span_7](start_span)[span_7](end_span)
  io.emit('online:count', onlineUsers.size);

  // Event: chat:history[span_8](start_span)[span_8](end_span)
  socket.on('chat:history', async (otherUserId) => {
    try {
      const messages = await Message.find({
        $or: [
          { sender: userId, receiver: otherUserId },
          { sender: otherUserId, receiver: userId }
        ]
      }).sort({ createdAt: 1 });
      socket.emit('chat:history', messages);
    } catch (err) {
      console.error(err);
    }
  });

  // Event: chat:send[span_9](start_span)[span_9](end_span)
  socket.on('chat:send', async ({ to, text }) => {
    try {
      const newMessage = new Message({
        sender: userId,
        receiver: to,
        text
      });
      await newMessage.save();

      // Emit chat:message to sender and receiver[span_10](start_span)[span_10](end_span)
      const senderSockets = onlineUsers.get(userId) || [];
      const receiverSockets = onlineUsers.get(to) || [];

      [...senderSockets, ...receiverSockets].forEach(sId => {
        io.to(sId).emit('chat:message', newMessage);
      });

      // Update unread count for receiver if not viewing[span_11](start_span)[span_11](end_span)
      const unreadCount = await Message.countDocuments({ sender: userId, receiver: to, read: false });
      receiverSockets.forEach(sId => {
        io.to(sId).emit('chat:unread:update', { userId: userId, count: unreadCount });
      });
    } catch (err) {
      console.error(err);
    }
  });

  // Event: chat:unread[span_12](start_span)[span_12](end_span)
  socket.on('chat:unread', async () => {
    try {
      const unreadMessages = await Message.aggregate([
        { $match: { receiver: new mongoose.Types.ObjectId(userId), read: false } },
        { $group: { _id: "$sender", count: { $sum: 1 } } }
      ]);
      const result = unreadMessages.map(item => ({ userId: item._id, count: item.count }));
      socket.emit('chat:unread', result);
    } catch (err) {
      console.error(err);
    }
  });

  // Event: chat:read[span_13](start_span)[span_13](end_span)
  socket.on('chat:read', async (otherUserId) => {
    try {
      await Message.updateMany(
        { sender: otherUserId, receiver: userId, read: false },
        { $set: { read: true } }
      );
      socket.emit('chat:unread:update', { userId: otherUserId, count: 0 });
    } catch (err) {
      console.error(err);
    }
  });

  // Event: chat:typing (bonus)[span_14](start_span)[span_14](end_span)
  socket.on('chat:typing', ({ to }) => {
    const receiverSockets = onlineUsers.get(to) || [];
    receiverSockets.forEach(sId => {
      io.to(sId).emit('chat:typing', { from: userId });
    });
  });

  // Event: disconnect[span_15](start_span)[span_15](end_span)
  socket.on('disconnect', () => {
    if (onlineUsers.has(userId)) {
      const userSockets = onlineUsers.get(userId);
      userSockets.delete(socket.id);
      if (userSockets.size === 0) {
        onlineUsers.delete(userId);
      }
    }
    io.emit('online:count', onlineUsers.size);
  });
});

const PORT = process.env.PORT || 5000;
mongoose.connect(process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/chatapp')
  .then(() => {
    console.log('MongoDB Connected');
    server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
  })
  .catch(err => console.log(err));