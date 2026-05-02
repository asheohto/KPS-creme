const { app, BrowserWindow } = require('electron');
const path = require('path');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');

// 1. START THE LOCAL BACKGROUND SERVER
// This runs a small Express + Socket.IO server in the background alongside the Electron window
const serverApp = express();
const localServer = http.createServer(serverApp);

serverApp.use(cors());
serverApp.use(express.json());

const io = new Server(localServer, {
  cors: { origin: '*' } // Allow any origin since this is running locally on the user's machine
});

// Socket connection handler — add authentication and timer logic here as needed
io.on('connection', (socket) => {
  console.log('App connected to local server.');
  
  socket.on('disconnect', () => {
    console.log('App disconnected from local server.');
  });
});

// Start the local server on a fixed port
const SERVER_PORT = 3002;
localServer.listen(SERVER_PORT, () => {
  console.log(`Local server running on port ${SERVER_PORT}.`);
});

// 2. CREATE THE ELECTRON APP WINDOW
function createWindow() {
  const mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    autoHideMenuBar: true,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
    },
  });

  const isDev = process.env.NODE_ENV !== 'production';

  if (isDev) {
    // In development, load from the Vite dev server
    mainWindow.loadURL('http://localhost:5173');
  } else {
    // In production, load the built files
    mainWindow.loadFile(path.join(__dirname, 'dist', 'index.html'));
  }
}

app.whenReady().then(() => {
  createWindow();

  // On macOS, re-create the window if the app is clicked in the dock with no windows open
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// Shut down the local server when all windows are closed
app.on('window-all-closed', () => {
  localServer.close();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
