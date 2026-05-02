require('dotenv').config();
const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server: SocketIOServer } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const axios = require('axios');
const multer = require('multer');
const FormData = require('form-data');

const app = express();
const server = http.createServer(app);

// --- SECURITY & MIDDLEWARE SETUP ---
// multer handles file uploads; files are kept in memory (not saved to disk) and capped at 5MB
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024 } // 5MB limit
});

app.use(express.json({ limit: '10mb' }));
app.use(cors({ origin: '*' }));

// Basic health-check routes so you can verify the server is running
app.get('/', (req, res) => res.send('Nova Core Backend: ONLINE.'));
app.get('/ping', (req, res) => res.send('Pong! I am awake.'));

// --- SERVER CONFIG ---
const PORT = process.env.PORT || 3000;
// JWT secret used to sign login tokens. Falls back to a random value if not set in .env (tokens won't survive restarts in that case)
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(64).toString('hex');
const MONGO_URI = process.env.MONGO_URI; 

if (!MONGO_URI) {
  console.error("FATAL ERROR: MONGO_URI environment variable missing.");
  process.exit(1);
}

mongoose.connect(MONGO_URI)
  .then(() => console.log("✅ DB Connected"))
  .catch(err => console.log("❌ DB Error:", err));

// --- DATABASE SCHEMAS ---
// Stores each user's account info, profile picture, and to-do lists
const UserSchema = new mongoose.Schema({
    username: { type: String, unique: true, required: true, maxlength: 32, trim: true },
    password: { type: String, required: true },
    role: { type: String, default: 'Member' },
    avatar: { type: String, default: "" },
    lastAvatarUpdate: { type: Date, default: 0 },
    todos: { type: Object, default: { urgent: [], today: [] } }
});
const User = mongoose.model('User', UserSchema);

// A "server" is a group chat space that users can create and share via invite code
const ServerSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 64, trim: true },
    code: { type: String, unique: true, required: true },
    owner: { type: String, required: true },
    members: [{ type: String }]
});
const Server = mongoose.model('Server', ServerSchema);

// Channels live inside servers — each one is a separate chat room
const ChannelSchema = new mongoose.Schema({
    name: { type: String, required: true, maxlength: 32, trim: true },
    serverId: { type: mongoose.Schema.Types.ObjectId, ref: 'Server', required: true }
});
ChannelSchema.index({ serverId: 1, name: 1 }, { unique: true });
const Channel = mongoose.model('Channel', ChannelSchema);

// Individual chat messages, linked to the channel they were sent in
const MessageSchema = new mongoose.Schema({
    user: String,
    userAvatar: String,
    msg: { type: String, maxlength: 2000 },
    image: String,
    channelId: { type: mongoose.Schema.Types.ObjectId, ref: 'Channel', required: true },
    timestamp: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', MessageSchema);


// --- AUTH HELPER FUNCTIONS ---

// Generates a short random uppercase invite code for group servers
function generateCode() {
    return crypto.randomBytes(3).toString('hex').toUpperCase();
}

// Creates a signed JWT token for a user that expires in 7 days
function issueToken(username) {
    return jwt.sign({ username }, JWT_SECRET, { expiresIn: '7d' });
}

// Verifies a token and returns the payload, or null if it's invalid/expired
function verifyToken(token) {
    try { return jwt.verify(token, JWT_SECRET); }
    catch { return null; }
}

// --- LOGIN RATE LIMITING ---
// Tracks failed login attempts per IP to block brute-force attacks
const loginAttempts = new Map();
const MAX_ATTEMPTS = 10;
const LOCKOUT_MS = 15 * 60 * 1000; // 15-minute lockout window

function isRateLimited(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry) return false;
    if (now - entry.firstAttempt > LOCKOUT_MS) { loginAttempts.delete(ip); return false; }
    return entry.count >= MAX_ATTEMPTS;
}

function recordFailedAttempt(ip) {
    const now = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || now - entry.firstAttempt > LOCKOUT_MS) {
        loginAttempts.set(ip, { count: 1, firstAttempt: now });
    } else {
        entry.count++;
    }
}

function clearAttempts(ip) { loginAttempts.delete(ip); }

// --- REAL-TIME SOCKET LOGIC ---
// Tracks which users are currently online (username -> true)
let onlineUsers = {};

const io = new SocketIOServer(server, {
  cors: { origin: '*' }
});

io.on('connection', (socket) => {
    const ip = socket.handshake.address;

    // Helper: reject any action from a socket that hasn't logged in yet
    function requireAuth() {
        if (!socket.username) { socket.emit('error_msg', 'Not authenticated.'); return false; }
        return true;
    }

    // --- 1. ACCOUNT CREATION & LOGIN ---

    socket.on('signup', async (data) => {
        try {
            if (!data?.username || !data?.password) return;
            const username = data.username.trim().slice(0, 32);
            const password = data.password.slice(0, 128);
            if (username.length < 2) return socket.emit('auth_error', 'Username must be at least 2 characters.');
            if (password.length < 6) return socket.emit('auth_error', 'Password must be at least 6 characters.');

            const hashedPassword = await bcrypt.hash(password, 10);
            await new User({ username, password: hashedPassword }).save();
            socket.emit('auth_error', 'Signup successful! Please login.');
        } catch {
            socket.emit('auth_error', 'Username taken.');
        }
    });

    socket.on('login', async (data) => {
        try {
            if (isRateLimited(ip)) return socket.emit('auth_error', 'Too many attempts. Try again in 15 minutes.');
            if (!data?.username || !data?.password) return;

            const user = await User.findOne({ username: data.username.trim() });
            if (user && await bcrypt.compare(data.password, user.password)) {
                clearAttempts(ip);
                const token = issueToken(user.username);
                socket.emit('login_success', { username: user.username, avatar: user.avatar, token });
            } else {
                recordFailedAttempt(ip);
                socket.emit('auth_error', 'Invalid credentials.');
            }
        } catch {
            socket.emit('auth_error', 'Server error.');
        }
    });

    // Called on page load — if the user has a saved token, restore their session without re-logging in
    socket.on('restore_session', async (token) => {
        try {
            const payload = verifyToken(token);
            if (!payload) return socket.emit('session_invalid');

            const user = await User.findOne({ username: payload.username });
            if (!user) return socket.emit('session_invalid');

            socket.username = user.username;
            onlineUsers[user.username] = true;

            socket.emit('session_restored', { avatar: user.avatar });
            socket.emit('init_todos', user.todos || { urgent: [], today: [] });

            // Send back the list of group servers this user is a member of
            const userServers = await Server.find({ members: user.username });
            socket.emit('server_list', userServers);
        } catch {
            socket.emit('session_invalid');
        }
    });

    // --- 2. PROFILE SETTINGS ---

    // Updates the user's profile picture. Limited to once every 24 hours to prevent abuse.
    socket.on('update_profile_pic', async (base64Image) => {
        if (!requireAuth()) return;
        try {
            const user = await User.findOne({ username: socket.username });
            if (!user) return;

            const now = Date.now();
            const diff = now - new Date(user.lastAvatarUpdate).getTime();
            const cooldown = 24 * 60 * 60 * 1000;

            if (diff < cooldown) {
                const hoursLeft = Math.ceil((cooldown - diff) / (1000 * 60 * 60));
                return socket.emit('profile_error', `Cooldown active. Try again in ${hoursLeft} hours.`);
            }

            if (typeof base64Image !== 'string' || !base64Image.startsWith('data:image/')) {
                return socket.emit('profile_error', 'Invalid image format.');
            }

            user.avatar = base64Image;
            user.lastAvatarUpdate = now;
            await user.save();
            socket.emit('profile_success', user.avatar);
        } catch {
            socket.emit('profile_error', 'Server error updating profile.');
        }
    });

    socket.on('change_password', async (data) => {
        if (!requireAuth()) return;
        try {
            if (!data?.oldPass || !data?.newPass) return;
            if (data.newPass.length < 6) return socket.emit('profile_error', 'New password must be at least 6 characters.');

            const user = await User.findOne({ username: socket.username });
            if (user && await bcrypt.compare(data.oldPass, user.password)) {
                user.password = await bcrypt.hash(data.newPass.slice(0, 128), 10);
                await user.save();
                socket.emit('profile_msg', 'Password updated successfully.');
            } else {
                socket.emit('profile_error', 'Incorrect old password.');
            }
        } catch {
            socket.emit('profile_error', 'Server error.');
        }
    });

    // Saves the user's to-do list. Sanitizes input to cap item count and length.
    socket.on('update_todos', async (todos) => {
        if (!requireAuth()) return;
        try {
            const sanitized = {
                urgent: Array.isArray(todos?.urgent) ? todos.urgent.slice(0, 50).map(t => String(t).slice(0, 200)) : [],
                today:  Array.isArray(todos?.today)  ? todos.today.slice(0, 50).map(t => String(t).slice(0, 200))  : []
            };
            await User.updateOne({ username: socket.username }, { $set: { todos: sanitized } });
        } catch { }
    });

    // --- 3. CONTACTS & DIRECT MESSAGES ---

    // Builds the contact list for a given user: global channels + their direct message conversations
    const sendContactList = async (targetUsername) => {
        try {
            let contactList = [];

            // Always include the global public channels at the top of the list
            const globalServer = await Server.findOne({ code: 'GLOBAL' });
            if (globalServer) {
                const globalChannels = await Channel.find({ serverId: globalServer._id });
                contactList = contactList.concat(globalChannels.map(c => ({
                    id: c._id.toString(),
                    name: `#${c.name}`,
                    status: 'online'
                })));
            }

            // Find all private servers this user is in (excluding the global server)
            const privateServers = await Server.find({
                code: { $ne: 'GLOBAL' },
                members: targetUsername
            });

            // DM servers have codes starting with "DM-"; display them as @username
            for (const srv of privateServers) {
                if (srv.code && srv.code.startsWith('DM-')) {
                    const channels = await Channel.find({ serverId: srv._id });
                    const partner = srv.members.find(m => m !== targetUsername) || 'Unknown';
                    contactList = contactList.concat(channels.map(c => ({
                        id: c._id.toString(),
                        name: `@${partner}`,
                        status: 'online'
                    })));
                }
            }

            io.to(targetUsername).emit('roster_data', contactList);
        } catch (error) {
            console.error(`Failed to build contact list for ${targetUsername}:`, error);
        }
    };

    // Called when a user's chat window connects — joins them to their personal room and loads their contacts
    socket.on('identify', async (username) => {
        socket.username = username;
        socket.join(username); // Join a private room named after the user so we can send them direct messages

        try {
            // Make sure the global server and its default channels exist (creates them if not)
            const globalServer = await Server.findOneAndUpdate(
                { code: 'GLOBAL' },
                { $setOnInsert: { name: 'Kinda Private Studying', owner: 'SYSTEM' } },
                { upsert: true, returnDocument: 'after' }
            );

            await Channel.findOneAndUpdate(
                { serverId: globalServer._id, name: 'general' },
                { $setOnInsert: { serverId: globalServer._id, name: 'general' } },
                { upsert: true }
            );
            

            sendContactList(username);
        } catch (error) {
            console.error('Failed to initialize contact list:', error);
        }
    });

    // Adds another user as a contact by creating a private DM server between the two of them
    socket.on('add_contact', async (targetUsername) => {
        if (!requireAuth()) return;
        const target = targetUsername.trim();
        if (target === socket.username) {
            return socket.emit('error_msg', 'You cannot add yourself as a contact.');
        }

        try {
            const targetExists = await User.findOne({ username: target });
            if (!targetExists) {
                return socket.emit('error_msg', 'That username does not exist.');
            }

            // Check if a DM conversation between these two users already exists
            const existingLink = await Server.findOne({
                code: /^DM-/,
                members: { $all: [socket.username, target], $size: 2 }
            });

            if (existingLink) {
                return socket.emit('error_msg', 'You already have a conversation with that user.');
            }

            const uniqueCode = 'DM-' + Math.random().toString(36).substring(2, 10).toUpperCase();

            const newServer = new Server({
                name: `DM: ${socket.username} & ${target}`,
                code: uniqueCode,
                owner: socket.username,
                members: [socket.username, target]
            });
            await newServer.save();

            // Create the default channel inside the new DM conversation
            await new Channel({
                name: 'direct-comms',
                serverId: newServer._id
            }).save();

            // Update both users' contact lists so the new DM shows up immediately
            sendContactList(socket.username);
            sendContactList(target);
        } catch (error) {
            socket.emit('error_msg', 'Something went wrong while adding the contact.');
        }
    });

    // Removes a contact and deletes the entire DM conversation history
    socket.on('remove_contact', async (channelId) => {
        if (!requireAuth()) return;
        try {
            const channel = await Channel.findById(channelId);
            if (!channel) return;
            
            const srv = await Server.findById(channel.serverId);
            if (!srv || srv.code === 'GLOBAL') {
                return socket.emit('error_msg', 'You cannot remove public channels.');
            }
            
            // Only members of this conversation can delete it
            if (!srv.members.includes(socket.username)) return;

            await Server.findByIdAndDelete(srv._id);
            await Channel.deleteMany({ serverId: srv._id });
            await Message.deleteMany({ channelId: channel._id });

            // Refresh the contact list for both users involved
            srv.members.forEach(member => {
                sendContactList(member);
            });
        } catch (error) {
            socket.emit('error_msg', 'Something went wrong while removing the contact.');
        }
    });

    // --- 4. GROUP SERVERS & MESSAGING ---

    // Creates a new group server with a randomly generated invite code and a default "general" channel
    socket.on('create_server', async (name) => {
        if (!requireAuth()) return;
        try {
            const serverName = String(name).trim().slice(0, 64);
            if (!serverName) return;

            // Keep generating codes until we find one that isn't already taken
            let code = generateCode();
            while (await Server.findOne({ code })) { code = generateCode(); }

            const newServer = new Server({ name: serverName, code, owner: socket.username, members: [socket.username] });
            await newServer.save();
            await new Channel({ name: 'general', serverId: newServer._id }).save();

            const userServers = await Server.find({ members: socket.username });
            socket.emit('server_list', userServers);
        } catch {
            socket.emit('error_msg', 'Failed to create server.');
        }
    });

    // Joins an existing group server by invite code
    socket.on('join_server', async (code) => {
        if (!requireAuth()) return;
        try {
            const srv = await Server.findOne({ code: String(code).trim().toUpperCase() });
            if (!srv) return socket.emit('error_msg', 'Invalid Invite Code');

            if (!srv.members.includes(socket.username)) {
                srv.members.push(socket.username);
                await srv.save();
            }

            const userServers = await Server.find({ members: socket.username });
            socket.emit('server_list', userServers);
        } catch {
            socket.emit('error_msg', 'Failed to join server.');
        }
    });

    // Opens a server: subscribes the user to that server's socket room and sends channel/member info
    socket.on('enter_server', async (serverId) => {
        if (!requireAuth()) return;
        try {
            const srv = await Server.findById(serverId);
            if (!srv || !srv.members.includes(socket.username)) return;

            // Leave the previous server room before joining the new one
            if (socket.currentServer) socket.leave(socket.currentServer);
            socket.currentServer = serverId.toString();
            socket.join(socket.currentServer);

            const channels = await Channel.find({ serverId });
            socket.emit('init_server', {
                serverName: srv.name,
                serverCode: srv.code,
                isOwner: srv.owner === socket.username,
                channels,
                members: srv.members,
                online: Object.keys(onlineUsers)
            });

            // Auto-open the first channel when entering a server
            if (channels.length > 0) joinChannel(socket, channels[0]._id);
        } catch {
            socket.emit('error_msg', 'Failed to enter server.');
        }
    });

    // Loads message history for a channel (last 50 messages from the past 5 days)
    async function joinChannel(socket, channelId) {
        try {
            const strId = channelId.toString();
            if (socket.currentChannel) socket.leave(socket.currentChannel);
            socket.currentChannel = strId;
            socket.join(strId);

            const fiveDaysAgo = new Date();
            fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

            const history = await Message.find({
                channelId: strId,
                timestamp: { $gte: fiveDaysAgo }
            }).sort({ timestamp: -1 }).limit(50);

            socket.emit('channel_history', history.reverse());
        } catch {
            socket.emit('error_msg', 'Failed to load channel history.');
        }
    }

    socket.on('select_channel', (id) => {
        if (!requireAuth()) return;
        joinChannel(socket, id);
    });

    // Only the server owner can create new channels
    socket.on('create_channel', async (name) => {
        if (!requireAuth() || !socket.currentServer) return;
        try {
            const srv = await Server.findById(socket.currentServer);
            if (!srv || srv.owner !== socket.username) return;

            // Normalize channel name: lowercase, spaces replaced with dashes
            const channelName = String(name).trim().toLowerCase().replace(/\s+/g, '-').slice(0, 32);
            if (!channelName) return;

            await new Channel({ name: channelName, serverId: socket.currentServer }).save();
            const channels = await Channel.find({ serverId: socket.currentServer });
            io.to(socket.currentServer).emit('update_channels', { channels });
        } catch {
            socket.emit('error_msg', 'Channel name exists.');
        }
    });

    // Only the server owner can delete channels
    socket.on('delete_channel', async (channelId) => {
        if (!requireAuth() || !socket.currentServer) return;
        try {
            const srv = await Server.findById(socket.currentServer);
            if (!srv || srv.owner !== socket.username) return;

            await Channel.findByIdAndDelete(channelId);
            await Message.deleteMany({ channelId });
            const channels = await Channel.find({ serverId: socket.currentServer });
            io.to(socket.currentServer).emit('update_channels', { channels });
        } catch {
            socket.emit('error_msg', 'Failed to delete channel.');
        }
    });

    // Sends a chat message (text and/or image) to the current channel
    socket.on('chat_message', async (data) => {
        if (!requireAuth() || !socket.currentChannel) return;
        try {
            const content = (typeof data === 'string' ? data : (data?.msg || '')).slice(0, 2000);
            const image = typeof data === 'object' ? data?.image : null;
            if (!content && !image) return;

            // Always fetch the latest avatar so it stays up to date in messages
            const user = await User.findOne({ username: socket.username });
            const currentAvatar = user?.avatar || "";

            const newMsg = new Message({
                user: socket.username,
                userAvatar: currentAvatar,
                msg: content,
                image,
                channelId: socket.currentChannel
            });
            await newMsg.save();
            io.to(socket.currentChannel).emit('chat_message', newMsg);
        } catch {
            socket.emit('error_msg', 'Failed to send message.');
        }
    });

    // Deletes a message — allowed if you sent it, or if you own the server it was sent in
    socket.on('delete_message', async (msgId) => {
        if (!requireAuth()) return;
        try {
            const msg = await Message.findById(msgId);
            if (!msg) return;

            const channel = await Channel.findById(msg.channelId);
            if (!channel) return;

            const srv = await Server.findById(channel.serverId);
            if (srv && (srv.owner === socket.username || msg.user === socket.username)) {
                await Message.findByIdAndDelete(msgId);
                io.to(socket.currentChannel).emit('message_deleted', msgId);
            }
        } catch {
            socket.emit('error_msg', 'Failed to delete message.');
        }
    });

    socket.on('disconnect', () => {
        delete onlineUsers[socket.username];
    });
});

// --- IMAGE UPLOAD ENDPOINT ---
// Accepts an image file, uploads it to catbox.moe, and returns the public URL
app.post('/api/upload', upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.file.mimetype.startsWith('image/')) return res.status(400).json({ error: 'Only images allowed' });

    try {
        const form = new FormData();
        form.append('reqtype', 'fileupload');
        form.append('userhash', '');
        form.append('fileToUpload', req.file.buffer, req.file.originalname);

        const response = await axios.post('https://catbox.moe/user/api.php', form, {
            headers: form.getHeaders()
        });

        res.json({ url: response.data });
    } catch (error) {
        console.error('Image upload error:', error.message);
        res.status(500).json({ error: 'Upload failed' });
    }
});

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
