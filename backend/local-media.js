const express = require('express');
const cors = require('cors');
const { Innertube, UniversalCache } = require('youtubei.js');

const app = express();
app.use(cors({ origin: '*' }));

// Innertube is a YouTube API wrapper that lets us search and fetch playlists without an API key
let youtube;
async function startYouTubeClient() {
  try {
    youtube = await Innertube.create({ cache: new UniversalCache(false) });
    console.log('YouTube client ready.');
  } catch (error) {
    console.error('Failed to start YouTube client:', error);
  }
}
startYouTubeClient();

// Search YouTube for videos matching a query string
// Returns up to 8 results with title, thumbnail, and channel name
app.get('/api/search', async (req, res) => {
  const query = req.query.q;
  if (!query) return res.status(400).json({ error: "Query parameter required." });
  if (!youtube) return res.status(503).json({ error: "YouTube client not ready." });

  try {
    const searchResults = await youtube.search(query, { type: 'video' });
    const formattedResults = searchResults.videos.slice(0, 8).map(video => ({
      videoId: video.id,
      title: video.title.text,
      thumbnail: video.thumbnails[0]?.url || '',
      channelTitle: video.author.name
    }));
    res.json({ items: formattedResults });
  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: "Search failed." });
  }
});

// Fetches all videos from a YouTube playlist by its ID
// Returns each video's title, thumbnail, and channel name
app.get('/api/playlist', async (req, res) => {
  const listId = req.query.list;
  if (!listId) return res.status(400).json({ error: "Playlist ID required." });
  if (!youtube) return res.status(503).json({ error: "YouTube client not ready." });

  try {
    const playlist = await youtube.getPlaylist(listId);
    const items = playlist.videos || playlist.items || [];
    
    if (items.length === 0) {
      return res.status(404).json({ error: "Playlist is empty, private, or invalid." });
    }

    const formattedResults = items.map(video => ({
      videoId: video.id,
      title: video.title?.text || video.title || 'Unknown Title',
      thumbnail: video.thumbnails?.[0]?.url || '',
      channelTitle: video.author?.name || 'Unknown Channel'
    }));
    res.json({ items: formattedResults });
  } catch (error) {
    console.error('Playlist fetch error:', error);
    res.status(500).json({ error: "Failed to fetch playlist." });
  }
});

app.listen(3001, () => {
  console.log('Local media server running on port 3001');
});
