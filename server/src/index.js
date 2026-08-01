require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

const registerRoomEvents = require('./rooms/roomEvents');
const registerChatEvents = require('./chat/chatEvents');
const registerCaptureEvents = require('./media/captureRoutes');
const registerSignalingEvents = require('./voice/signalingEvents');
const uploadRoutes = require('./media/uploadRoutes');
const hlsRoutes = require('./media/hlsRoutes');


const app = express();
const server = http.createServer(app);

const PORT = process.env.PORT || 3001;
const rawOrigins = process.env.CLIENT_ORIGIN || '*';
const CLIENT_ORIGIN = rawOrigins;
const allowedOrigins = rawOrigins.split(',').map((s) => s.trim());


const corsOriginCheck = (origin, callback) => {
  if (!origin || rawOrigins === '*' || allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
    return callback(null, true);
  }
  // Allow all Vercel deployed app subdomains dynamically
  if (origin.endsWith('.vercel.app')) {
    return callback(null, true);
  }
  callback(null, true);
};

app.use(cors({
  origin: corsOriginCheck,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  credentials: true
}));

app.use(express.json());

// Trivial Health Check Endpoint (used by Render and Client Wake-Up flow)
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: Date.now(),
    uptime: Math.floor(process.uptime())
  });
});

// Attach Socket.io instance to Express app for route access

const io = new Server(server, {
  cors: {
    origin: corsOriginCheck,
    methods: ['GET', 'POST']
  },
  maxHttpBufferSize: 1e8 // 100MB buffer for binary video chunks
});

app.set('io', io);

// Mount media upload & HLS static routes
app.use(uploadRoutes);
app.use(hlsRoutes);

// Basic health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

io.on('connection', (socket) => {
  console.log(`[Socket Connected] ID: ${socket.id}`);

  registerRoomEvents(io, socket);
  registerChatEvents(io, socket);
  registerCaptureEvents(io, socket);
  registerSignalingEvents(io, socket);



  socket.on('disconnect', (reason) => {
    console.log(`[Socket Disconnected] ID: ${socket.id}, Reason: ${reason}`);
  });
});

server.listen(PORT, () => {
  console.log(`=================================`);
  console.log(` WatchTogether Server Running `);
  console.log(` Port: ${PORT}`);
  console.log(` Client Origin: ${rawOrigins}`);
  console.log(`=================================`);
});

