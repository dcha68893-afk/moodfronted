// Enhanced toggleRecording function to replace the corrupted one
// This should be inserted into calls-ui.js UIEventHandlers

// First, add CSS for recording pulse effect
const recordingCSS = `
.recording-pulse {
    animation: recordingPulse 1.5s ease-in-out infinite !important;
}

@keyframes recordingPulse {
    0% { opacity: 1; transform: scale(1); }
    50% { opacity: 0.7; transform: scale(1.1); }
    100% { opacity: 1; transform: scale(1); }
}
`;

// Inject CSS
const style = document.createElement('style');
style.textContent = recordingCSS;
document.head.appendChild(style);

// Enhanced toggleRecording function
const enhancedToggleRecording = function() {
    if (!UIState._mediaRecorder) {
        // Check if we have video tracks for video recording
        const localVideoTracks = UIState.localStream ? UIState.localStream.getVideoTracks() : [];
        const remoteVideoEl = document.getElementById('remoteVideo');
        const remoteVideoTracks = (remoteVideoEl && remoteVideoEl.srcObject) ? remoteVideoEl.srcObject.getVideoTracks() : [];
        const hasVideo = localVideoTracks.length > 0 || remoteVideoTracks.length > 0;

        let recordStream;
        let mimeType;
        let fileExtension;

        if (hasVideo) {
            // Video recording: composite both video feeds on canvas
            const canvas = document.createElement('canvas');
            canvas.width = 1280;
            canvas.height = 720;
            const ctx = canvas.getContext('2d');
            
            // Create video elements for compositing
            const localVideo = document.createElement('video');
            const remoteVideo = document.createElement('video');
            localVideo.muted = true;
            remoteVideo.muted = true;
            localVideo.autoplay = true;
            remoteVideo.autoplay = true;
            
            // Set sources
            if (UIState.localStream) localVideo.srcObject = UIState.localStream;
            if (remoteVideoEl && remoteVideoEl.srcObject) remoteVideo.srcObject = remoteVideoEl.srcObject;
            
            // Composite frames
            const drawFrame = () => {
                if (!UIState._mediaRecorder || UIState._mediaRecorder.state !== 'recording') return;
                
                // Draw remote video full screen
                if (remoteVideo.readyState === 4) {
                    ctx.drawImage(remoteVideo, 0, 0, canvas.width, canvas.height);
                } else {
                    ctx.fillStyle = '#000';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                
                // Draw local video as PiP in top-right corner
                if (localVideo.readyState === 4) {
                    const pipWidth = 320;
                    const pipHeight = 240;
                    const pipX = canvas.width - pipWidth - 20;
                    const pipY = 20;
                    
                    // Draw PiP background
                    ctx.fillStyle = 'rgba(0,0,0,0.3)';
                    ctx.fillRect(pipX - 2, pipY - 2, pipWidth + 4, pipHeight + 4);
                    
                    // Draw local video
                    ctx.drawImage(localVideo, pipX, pipY, pipWidth, pipHeight);
                }
                
                requestAnimationFrame(drawFrame);
            };
            
            // Start compositing
            setTimeout(() => drawFrame(), 1000);
            
            // Mix audio tracks
            const audioTracks = [];
            if (UIState.localStream) UIState.localStream.getAudioTracks().forEach(t => audioTracks.push(t));
            const remoteAudioEl = document.getElementById('remoteAudio');
            if (remoteAudioEl && remoteAudioEl.srcObject) {
                remoteAudioEl.srcObject.getAudioTracks().forEach(t => audioTracks.push(t));
            }
            
            // Create canvas stream with audio
            recordStream = canvas.captureStream(30);
            audioTracks.forEach(track => recordStream.addTrack(track));
            
            mimeType = 'video/webm;codecs=vp9,opus';
            fileExtension = 'webm';
        } else {
            // Audio-only recording
            const tracks = [];
            if (UIState.localStream) UIState.localStream.getAudioTracks().forEach(t => tracks.push(t));
            const remoteAudioEl = document.getElementById('remoteAudio');
            if (remoteAudioEl && remoteAudioEl.srcObject) {
                remoteAudioEl.srcObject.getAudioTracks().forEach(t => tracks.push(t));
            }
            if (tracks.length === 0) { showNotification('No audio stream to record', 'error'); return; }
            
            recordStream = new MediaStream(tracks);
            mimeType = 'audio/webm;codecs=opus';
            fileExtension = 'webm';
        }

        let mr;
        try { 
            mr = new MediaRecorder(recordStream, { mimeType }); 
        } catch(e) { 
            try { mr = new MediaRecorder(recordStream); } 
            catch(e2) { showNotification('Recording not supported', 'error'); return; } 
        }

        UIState._recordChunks = [];
        mr.ondataavailable = e => { if (e.data && e.data.size > 0) UIState._recordChunks.push(e.data); };
        mr.onstop = () => {
            const blob = new Blob(UIState._recordChunks, { type: hasVideo ? 'video/webm' : 'audio/webm' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            const timestamp = new Date().toISOString().slice(0,19).replace(/:/g,'-');
            a.download = `call-recording-${timestamp}.${fileExtension}`;
            a.href = url;
            a.click(); 
            URL.revokeObjectURL(url);
            
            UIState._recordChunks = [];
            UIState._mediaRecorder = null;
            
            // Reset UI state
            if (elements.menuRecordLabel) elements.menuRecordLabel.textContent = 'Record';
            const recIcon = elements.menuRecord && elements.menuRecord.querySelector('i');
            if (recIcon) {
                recIcon.style.color = '#ff3b30';
                recIcon.classList.remove('recording-pulse');
            }
            
            showNotification(`${hasVideo ? 'Video' : 'Audio'} recording saved`, 'success');
        };
        
        mr.start(1000);
        UIState._mediaRecorder = mr;
        
        // Update UI for recording state
        if (elements.menuRecordLabel) elements.menuRecordLabel.textContent = 'Stop Recording';
        const recIcon = elements.menuRecord && elements.menuRecord.querySelector('i');
        if (recIcon) {
            recIcon.style.color = '#ff3b30';
            recIcon.classList.add('recording-pulse');
        }
        
        showNotification(`${hasVideo ? 'Video' : 'Audio'} recording started`, 'info');
    } else {
        UIState._mediaRecorder.stop();
        showNotification('Recording stopped — saving…', 'info');
    }
};

// Export for use in main file
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { enhancedToggleRecording, recordingCSS };
} else {
    window.enhancedToggleRecording = enhancedToggleRecording;
    window.recordingCSS = recordingCSS;
}
