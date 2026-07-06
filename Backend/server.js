require('dotenv').config();
const express = require('express');
const http = require('http');
const multer = require('multer');
const { Server } = require('socket.io');
const { setupSecurity } = require('./middleware/security');
const routes = require('./routes');
const { setupSocket } = require('./socket');
const { allowedOrigins } = require('./config/cors');
const { env } = require('./config/env');

const app = express();
app.set('trust proxy', 1);
const server = http.createServer(app);
const PORT = parseInt(env('PORT') || '5000', 10);
const io = new Server(server, {
  cors: {
    origin: allowedOrigins,
    methods: ['GET', 'POST'],
    credentials: true
  },
  pingTimeout: 60000,
  pingInterval: 25000,
  transports: ['websocket', 'polling']
});

app.set('io', io);
setupSecurity(app);
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/', (req, res) => {
  res.json({
    success: true,
    message: 'HexaChat API server is running',
    app: 'https://hexachat2.netlify.app',
    health: '/api/health',
    api: '/api'
  });
});

app.use('/api', routes);

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'API route not found' });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ success: false, message: 'File too large or invalid' });
  }
  if (err.message === 'File type not allowed') {
    return res.status(400).json({ success: false, message: err.message });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ success: false, message: 'Invalid request body' });
  }
  console.error('Server error:', err);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

setupSocket(io);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`HexaChat Backend running on port ${PORT}`);
  console.log(`CORS origins: ${allowedOrigins.join(', ')}`);
});
