import React, { useState, useEffect, useRef } from 'react';

// currentUser is used so each user's queue and playback position are saved separately
function YouTubeMusicPlayer({ volume, currentUser }) {
  // Storage keys are tied to the logged-in user so music state doesn't bleed between accounts
  const CACHE_KEY_QUEUE = `nova_music_queue_${currentUser}`;
  const CACHE_KEY_INDEX = `nova_music_index_${currentUser}`;
  const CACHE_KEY_TIME = `nova_music_time_${currentUser}`;

  // Load the saved queue (list of tracks) from localStorage
  const [queue, setQueue] = useState(() => {
    if (!currentUser) return [];
    const saved = localStorage.getItem(CACHE_KEY_QUEUE);
    return saved ? JSON.parse(saved) : [];
  });
  
  // Load the index of the track that was playing when the user last left
  const [currentIndex, setCurrentIndex] = useState(() => {
    if (!currentUser) return 0;
    const saved = localStorage.getItem(CACHE_KEY_INDEX);
    return saved !== null ? parseInt(saved, 10) : 0;
  });

  // Load the playback position (in seconds) so we can resume where the user left off
  const [currentTime, setCurrentTime] = useState(() => {
    if (!currentUser) return 0;
    const saved = localStorage.getItem(CACHE_KEY_TIME);
    return saved !== null ? parseFloat(saved) : 0;
  });

  const [playing, setPlaying] = useState(false);
  const [search, setSearch] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [duration, setDuration] = useState(0);
  const playerRef = useRef(null); // Reference to the YouTube IFrame player object
  const [playerReady, setPlayerReady] = useState(false);

  // Keep a ref to queue length so the "track ended" event handler always has the latest value
  const queueLengthRef = useRef(queue.length);
  useEffect(() => {
    queueLengthRef.current = queue.length;
  }, [queue.length]);

  // Save queue and current track index to localStorage whenever they change
  useEffect(() => {
    if (currentUser) {
      localStorage.setItem(CACHE_KEY_QUEUE, JSON.stringify(queue));
      localStorage.setItem(CACHE_KEY_INDEX, currentIndex.toString());
    }
  }, [queue, currentIndex, currentUser, CACHE_KEY_QUEUE, CACHE_KEY_INDEX]);

  // Load the YouTube IFrame API script if it isn't already loaded
  useEffect(() => {
    if (!window.YT) {
      const tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      const firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);

      window.onYouTubeIframeAPIReady = () => {
        setPlayerReady(true);
      };
    } else {
      setPlayerReady(true);
    }
  }, []);

  // Create the YouTube player once the API is ready
  useEffect(() => {
    if (playerReady && !playerRef.current) {
      playerRef.current = new window.YT.Player('youtube-player', {
        playerVars: { autoplay: 1, controls: 0, disablekb: 1 },
        events: {
          onStateChange: (event) => {
            // When a track finishes, move to the next one (or stop if we're at the end)
            if (event.data === window.YT.PlayerState.ENDED) {
              resetTime(); 
              setCurrentIndex((prev) => {
                if (prev < queueLengthRef.current - 1) {
                  return prev + 1;
                } else {
                  setPlaying(false);
                  return prev;
                }
              });
            }
          },
          onReady: (event) => {
            event.target.setVolume(Number(volume));
            // If there's a saved queue, cue up the last-played track at the saved position
            if (queue.length > 0 && queue[currentIndex]) {
              const savedTime = parseFloat(localStorage.getItem(CACHE_KEY_TIME)) || 0;
              event.target.cueVideoById({
                videoId: queue[currentIndex].videoId,
                startSeconds: savedTime
              });
            }
          }
        },
      });
    }
  }, [playerReady, queue, currentIndex, CACHE_KEY_TIME, volume]);

  // Watch for track changes and load the new video automatically
  const currentVideoId = queue[currentIndex]?.videoId;
  
  useEffect(() => {
    if (playerRef.current && currentVideoId) {
      // Read start time directly from localStorage to avoid stale state
      const startSecs = parseFloat(localStorage.getItem(CACHE_KEY_TIME)) || 0;
      playerRef.current.loadVideoById(currentVideoId, startSecs);
      playerRef.current.playVideo();
      setPlaying(true);
    }
  }, [currentVideoId, CACHE_KEY_TIME]);

  // Keep the player volume in sync with the mixer slider
  useEffect(() => {
    if (playerRef.current && typeof playerRef.current.setVolume === 'function') {
      playerRef.current.setVolume(Number(volume));
    }
  }, [volume]);

  // Poll the player every second while playing to update the progress bar and save position
  useEffect(() => {
    let interval;
    if (playing) {
      interval = setInterval(() => {
        if (playerRef.current && typeof playerRef.current.getCurrentTime === 'function') {
          const currentSecs = playerRef.current.getCurrentTime();
          setCurrentTime(currentSecs);
          setDuration(playerRef.current.getDuration());
          if (currentUser) {
            localStorage.setItem(CACHE_KEY_TIME, currentSecs.toString());
          }
        }
      }, 1000);
    } else if (!playing && interval) {
      clearInterval(interval);
    }
    return () => clearInterval(interval);
  }, [playing, currentUser, CACHE_KEY_TIME]);

  // Reset playback position to zero (used when skipping tracks)
  const resetTime = () => {
    setCurrentTime(0);
    if (currentUser) {
      localStorage.setItem(CACHE_KEY_TIME, '0');
    }
  };

  // Extract a video ID from a full YouTube URL, or return the string as-is if it's already an ID
  const extractVideoId = (url) => {
    if (!url) return '';
    const parts = url.split('v=');
    if (parts.length > 1) return parts[1].split('&')[0];
    return url;
  };

  // Search YouTube or load a playlist URL
  const searchYouTube = async () => {
    if (!search.trim()) return;
    
    setSearching(true);
    try {
      const playlistMatch = search.match(/[?&]list=([^#\&\?]+)/);

      if (playlistMatch && playlistMatch[1]) {
        // It's a playlist URL — fetch all tracks and add them to the queue
        const listId = playlistMatch[1];
        const response = await fetch(`http://localhost:3001/api/playlist?list=${listId}`);
        if (!response.ok) throw new Error('Local media server rejected the request.');
        
        const data = await response.json();
        
        if (data.items && data.items.length > 0) {
          addAllToQueue(data.items);
          setSearch('');
          setSearchResults([]);
        }
      } else {
        // Regular search — show results for the user to pick from
        const response = await fetch(`http://localhost:3001/api/search?q=${encodeURIComponent(search)}`);
        if (!response.ok) throw new Error('Local media server rejected the request.');

        const data = await response.json();
        if (data.items) {
          setSearchResults(data.items);
        }
      }
    } catch (error) {
      alert('Could not connect to the local media server. Make sure it is running: node local-media.js (port 3001).');
      console.error(error);
    }
    setSearching(false);
  };

  // Add a list of tracks to the queue all at once (used for playlist imports)
  const addAllToQueue = (videos) => {
    setQueue(q => {
      const newQueue = [...q, ...videos];
      // If the queue was empty, start playing the first track immediately
      if (q.length === 0 && playerRef.current && videos.length > 0) {
        resetTime();
        setCurrentIndex(0);
        playerRef.current.loadVideoById(videos[0].videoId, 0);
        playerRef.current.playVideo();
        setPlaying(true);
      }
      return newQueue;
    });
  };

  // Add a single track to the queue
  const addToQueue = (video) => {
    setQueue(q => {
      const newQueue = [...q, video];
      // If this is the first track, start playing it immediately
      if (newQueue.length === 1 && playerRef.current) {
        resetTime();
        setCurrentIndex(0);
        playerRef.current.loadVideoById(video.videoId, 0);
        playerRef.current.playVideo();
        setPlaying(true);
      }
      return newQueue;
    });
    setSearchResults([]);
    setSearch('');
  };

  // Remove a track from the queue by index
  const removeFromQueue = (index) => {
    setQueue(q => {
      const newQueue = q.filter((_, i) => i !== index);
      if (index === currentIndex && playerRef.current) {
        if (newQueue.length > 0) {
          // Move to the nearest valid track
          resetTime();
          const newIndex = Math.min(currentIndex, newQueue.length - 1);
          setCurrentIndex(newIndex);
        } else {
          // Queue is now empty — stop everything
          resetTime();
          setCurrentIndex(0);
          setPlaying(false);
          setDuration(0);
          playerRef.current.stopVideo();
        }
      } else if (index < currentIndex) {
        // Adjust the index since a track before the current one was removed
        setCurrentIndex(currentIndex - 1);
      }
      return newQueue;
    });
  };

  const togglePlay = () => {
    if (!playerRef.current || queue.length === 0) return;
    if (playing) {
      playerRef.current.pauseVideo();
    } else {
      playerRef.current.playVideo();
    }
    setPlaying(!playing);
  };

  const playPrevious = () => {
    if (currentIndex > 0) {
      resetTime();
      setCurrentIndex(prev => prev - 1);
    }
  };

  const playNext = () => {
    if (currentIndex < queue.length - 1) {
      resetTime();
      setCurrentIndex(prev => prev + 1);
    } else {
      // Already at the last track — stop playback
      if (playerRef.current) playerRef.current.stopVideo();
      resetTime();
      setPlaying(false);
    }
  };

  const playTrack = (index) => {
    resetTime();
    setCurrentIndex(index);
  };

  // Handle the seek bar — update playback position when the user drags it
  const handleSeek = (e) => {
    const newTime = Number(e.target.value);
    setCurrentTime(newTime);
    if (currentUser) {
      localStorage.setItem(CACHE_KEY_TIME, newTime.toString());
    }
    if (playerRef.current && typeof playerRef.current.seekTo === 'function') {
      playerRef.current.seekTo(newTime, true);
    }
  };

  // Format seconds as M:SS for display
  const formatTime = (timeInSeconds) => {
    if (!timeInSeconds || isNaN(timeInSeconds)) return "0:00";
    const m = Math.floor(timeInSeconds / 60);
    const s = Math.floor(timeInSeconds % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const currentTrack = queue[currentIndex];

  return (
    <div style={{
      background: 'var(--card)', border: '1px solid var(--border)', borderRadius: '8px',
      padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', position: 'relative',
    }}>
      {/* Hidden YouTube player iframe — required by the IFrame API but visually invisible */}
      <div style={{ position: 'absolute', top: '-9999px', left: '-9999px', width: '250px', height: '250px', opacity: 0, pointerEvents: 'none' }}>
        <div id="youtube-player"></div>
      </div>

      <h2 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-muted)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>
        Music Player
      </h2>

      {/* NOW PLAYING — thumbnail, title, progress bar, and playback controls */}
      <div style={{ display: 'flex', gap: '16px', alignItems: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', padding: '16px' }}>
        {currentTrack ? (
          <img src={currentTrack.thumbnail} alt="Thumbnail" style={{ width: 80, height: 60, borderRadius: '4px', objectFit: 'contain', backgroundColor: '#000', border: '1px solid var(--border)', flexShrink: 0 }} />
        ) : (
          <div style={{ width: 80, height: 60, borderRadius: '4px', backgroundColor: 'var(--accent-dim)', border: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, color: 'var(--accent)' }}>♪</div>
        )}
        
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 600, fontSize: '14px', marginBottom: '4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
            {currentTrack?.title || 'No track selected'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            {currentTrack?.channelTitle || 'Select a song from the queue'}
          </div>

          {/* Progress bar */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', width: '28px', textAlign: 'right' }}>{formatTime(currentTime)}</span>
            <input type="range" min="0" max={duration || 100} value={currentTime} onChange={handleSeek} disabled={!currentTrack} style={{ flex: 1, width: '100%', margin: 0, opacity: currentTrack ? 1 : 0.5 }} />
            <span style={{ fontSize: '10px', color: 'var(--text-muted)', fontVariantNumeric: 'tabular-nums', width: '28px' }}>{formatTime(duration)}</span>
          </div>
          
          {/* Previous / Play-Pause / Next buttons */}
          <div style={{ display: 'flex', gap: '12px', alignItems: 'center', justifyContent: 'center' }}>
            <button onClick={playPrevious} disabled={currentIndex === 0} style={{ background: 'none', border: 'none', color: currentIndex === 0 ? 'var(--border)' : 'var(--text-muted)', fontSize: '18px', padding: 0, cursor: currentIndex === 0 ? 'not-allowed' : 'pointer' }}>⏮</button>
            <button onClick={togglePlay} disabled={queue.length === 0} style={{ width: 36, height: 36, borderRadius: '50%', background: queue.length === 0 ? 'var(--border)' : 'var(--accent)', border: 'none', color: '#131313', fontSize: '14px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: queue.length === 0 ? 'not-allowed' : 'pointer' }}>
              {playing ? '⏸' : '▶'}
            </button>
            <button onClick={playNext} disabled={currentIndex >= queue.length - 1} style={{ background: 'none', border: 'none', color: currentIndex >= queue.length - 1 ? 'var(--border)' : 'var(--text-muted)', fontSize: '18px', padding: 0, cursor: currentIndex >= queue.length - 1 ? 'not-allowed' : 'pointer' }}>⏭</button>
          </div>
        </div>
      </div>

      {/* SEARCH — type a query or paste a YouTube playlist URL */}
      <div>
        <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Search YouTube or Paste Playlist URL</div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && searchYouTube()} placeholder="Search or paste link..." style={{ flex: 1, padding: '10px 14px', borderRadius: '6px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: '13px', fontFamily: 'Inter, sans-serif' }} />
          <button onClick={searchYouTube} disabled={searching} style={{ padding: '10px 20px', background: 'var(--accent)', border: 'none', borderRadius: '6px', color: '#131313', fontWeight: 700, fontSize: '13px', minWidth: '80px' }}>{searching ? '...' : 'Search'}</button>
        </div>
        {searchResults.length > 0 && (
          <div style={{ marginTop: '12px', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '6px', overflow: 'hidden' }}>
            {searchResults.map(result => (
              <div key={result.videoId} style={{ display: 'flex', gap: '12px', padding: '10px', borderBottom: '1px solid var(--border)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.2s' }} onMouseEnter={e => e.currentTarget.style.background = 'var(--accent-dim)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'} onClick={() => addToQueue(result)}>
                <img src={result.thumbnail} alt={result.title} style={{ width: 64, height: 48, borderRadius: '4px', objectFit: 'cover' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{result.channelTitle}</div>
                </div>
                <button style={{ padding: '6px 12px', background: 'var(--accent)', border: 'none', borderRadius: '4px', color: '#131313', fontSize: '11px', fontWeight: 700 }}>+ Add</button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* QUEUE — list of all tracks, highlighting the one currently playing */}
      {queue.length > 0 && (
        <div>
          <div style={{ fontSize: '11px', fontWeight: 600, letterSpacing: '0.08em', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: '10px' }}>Queue ({queue.length})</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', maxHeight: '300px', overflowY: 'auto' }}>
            {queue.map((track, i) => (
              <div key={`${track.videoId}-${i}`} style={{ display: 'flex', alignItems: 'center', gap: '10px', padding: '10px 12px', borderRadius: '5px', background: i === currentIndex ? 'var(--accent-dim)' : 'transparent', borderLeft: i === currentIndex ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer' }} onClick={() => playTrack(i)}>
                <span style={{ fontSize: '11px', color: 'var(--text-muted)', width: 20, textAlign: 'center', flexShrink: 0 }}>{i + 1}</span>
                <img src={track.thumbnail} alt={track.title} style={{ width: 48, height: 36, borderRadius: '3px', objectFit: 'cover', flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: '13px', color: i === currentIndex ? 'var(--accent)' : 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: i === currentIndex ? 600 : 400 }}>{track.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{track.channelTitle}</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); removeFromQueue(i); }} style={{ padding: '4px 8px', background: 'transparent', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-muted)', fontSize: '11px', flexShrink: 0 }}>Remove</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default YouTubeMusicPlayer;
