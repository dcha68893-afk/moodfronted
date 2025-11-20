// calls.js - Complete WebRTC Call Implementation
// ==================== CALL MANAGEMENT SYSTEM ====================

console.log('📞 calls.js loading at:', new Date().toISOString());
console.log('🔍 Pre-check Firebase availability:');
console.log('  - window.db:', !!window.db);
console.log('  - window.firebase:', !!window.firebase);
console.log('  - window.currentUser:', !!window.currentUser);
console.log('  - window.chat.js loaded:', !!window.currentUser); // Check if chat.js is loaded

console.log('📞 calls.js loading...');

// Global call state - will be initialized when needed
let callState = null;
let localStream = null;
let remoteStream = null;
let peerConnection = null;
let isMuted = false;
let isVideoOff = false;
let isInCall = false;
let lastCallTime = 0;
const CALL_COOLDOWN = 2000;

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { urls: "stun:stun2.l.google.com:19302" },
        {
            urls: "turn:global.relay.metered.ca:80",
            username: "openai",
            credential: "openai"
        }
    ],
    iceCandidatePoolSize: 10,
    bundlePolicy: 'max-bundle',
    rtcpMuxPolicy: 'require'
};

// Call spam protection
const callSpamProtection = {
    callAttempts: 0,
    lastCallAttempt: 0,
    MAX_CALL_ATTEMPTS: 5,
    CALL_COOLDOWN_PERIOD: 10000,

    canMakeCall: function() {
        const now = Date.now();
        if (now - this.lastCallAttempt < this.CALL_COOLDOWN_PERIOD) {
            console.warn('Call spam protection: Too many call attempts');
            return false;
        }
        
        if (this.callAttempts >= this.MAX_CALL_ATTEMPTS) {
            const timeSinceFirstAttempt = now - this.lastCallAttempt;
            if (timeSinceFirstAttempt < 60000) {
                console.warn('Call spam protection: Rate limit exceeded');
                return false;
            } else {
                this.callAttempts = 0;
            }
        }
        
        this.callAttempts++;
        this.lastCallAttempt = now;
        return true;
    },
    
    resetCounter: function() {
        this.callAttempts = 0;
        this.lastCallAttempt = 0;
    }
};

// Active call notifications
if (!window.activeCallNotifications) {
    window.activeCallNotifications = new Map();
}

// ==================== INITIALIZATION ====================

function setupCallEventListeners() {
    console.log('🔧 Setting up call event listeners');
    
    // Remove any existing listeners to prevent duplicates
    document.removeEventListener('click', handleCallClickEvents);
    
    // Add the main click event listener
    document.addEventListener('click', handleCallClickEvents);
    
    console.log('✅ Call event listeners setup complete');
}

function handleCallClickEvents(e) {
    try {
        // Voice call button
        if (e.target.closest('.friend-call-btn')) {
            const btn = e.target.closest('.friend-call-btn');
            if (btn.disabled) return;
            
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            
            if (!friendId || !friendName) {
                console.error('❌ Missing friend data:', { friendId, friendName });
                showToast('Error: Missing friend information', 'error');
                return;
            }
            
            console.log('📞 Voice call clicked:', friendName, friendId);
            
            // Check if user is authenticated
            if (!window.currentUser || !window.currentUser.uid) {
                console.error('❌ User not authenticated');
                showToast('Please log in to make calls', 'error');
                return;
            }
            
            startVoiceCallWithFriend(friendId, friendName);
            return;
        }
        
        // Video call button
        if (e.target.closest('.friend-video-call-btn')) {
            const btn = e.target.closest('.friend-video-call-btn');
            if (btn.disabled) return;
            
            const friendId = btn.dataset.id;
            const friendName = btn.dataset.name;
            
            if (!friendId || !friendName) {
                console.error('❌ Missing friend data:', { friendId, friendName });
                showToast('Error: Missing friend information', 'error');
                return;
            }
            
            console.log('🎥 Video call clicked:', friendName, friendId);
            
            // Check if user is authenticated
            if (!window.currentUser || !window.currentUser.uid) {
                console.error('❌ User not authenticated');
                showToast('Please log in to make calls', 'error');
                return;
            }
            
            startVideoCallWithFriend(friendId, friendName);
            return;
        }
        
        // Call control buttons - only work when in call
        if (e.target.closest('#muteBtn')) {
            if (!isInCall) {
                showToast('No active call', 'warning');
                return;
            }
            console.log('🔇 Mute button clicked');
            toggleMute();
            return;
        }
        
        if (e.target.closest('#videoToggleBtn')) {
            if (!isInCall) {
                showToast('No active call', 'warning');
                return;
            }
            console.log('📹 Video toggle button clicked');
            toggleVideo();
            return;
        }
        
        if (e.target.closest('#endCallBtn')) {
            if (!isInCall) {
                showToast('No active call', 'warning');
                return;
            }
            console.log('📞 End call button clicked');
            endCall();
            return;
        }
        
    } catch (error) {
        console.error('❌ Error in call event handler:', error);
        showToast('Error handling call action', 'error');
    }
}

// Add this helper function to check call system readiness (ONCE, not repeatedly)
function checkCallSystemReady() {
    const isReady = window.currentUser && window.currentUser.uid;
    
    if (!isReady) {
        console.log('⏳ Call system waiting for user authentication...');
    } else {
        console.log('✅ Call system ready - User authenticated:', window.currentUser.uid);
    }
    
    return isReady;
}

// Update call buttons state - call this only when needed
function updateCallButtonsState() {
    const callButtons = document.querySelectorAll('.friend-call-btn, .friend-video-call-btn');
    const isSystemReady = checkCallSystemReady();
    
    callButtons.forEach(btn => {
        if (isSystemReady && !isInCall) {
            btn.disabled = false;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            btn.classList.add('cursor-pointer', 'hover:opacity-90');
        } else {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            btn.classList.remove('cursor-pointer', 'hover:opacity-90');
        }
    });
}

// Initialize call system - call this only when user is authenticated
function initializeCallSystem() {
    console.log('📞 Initializing call system...');
    
    // Check if user is authenticated
    if (!window.currentUser || !window.currentUser.uid) {
        console.log('⏳ Call system delayed - waiting for user authentication');
        return;
    }
    
    // Initialize call state
    callState = {
        isCaller: false,
        isReceivingCall: false,
        callType: null,
        remoteUserId: null,
        callId: null,
        callStartTime: null,
        timerInterval: null
    };
    
    setupCallEventListeners();
    setupCallUI();
    
    // Update button states once
    updateCallButtonsState();
    
    // Initialize incoming call listener
    listenForIncomingCalls();
    
    console.log('✅ Call system initialized for user:', window.currentUser.uid);
}

// Remove the setInterval and replace with this smarter initialization:
let callSystemInitialized = false;

function initializeCallSystemWhenReady() {
    if (callSystemInitialized) return;
    
    if (window.currentUser && window.currentUser.uid) {
        initializeCallSystem();
        callSystemInitialized = true;
    } else {
        console.log('⏳ Waiting for user authentication to initialize call system...');
        // Try again in 1 second
        setTimeout(initializeCallSystemWhenReady, 1000);
    }
}

// Also update button states when authentication state changes
function onUserAuthenticated() {
    console.log('🔐 User authenticated, updating call system...');
    updateCallButtonsState();
    
    if (!callSystemInitialized) {
        initializeCallSystemWhenReady();
    }
}

function setupCallUI() {
    console.log('🎨 Setting up call UI');
    
    // Remove existing call container if any
    const existingContainer = document.getElementById('callContainer');
    if (existingContainer) {
        existingContainer.remove();
    }
    
    // Create new call container
    const callContainer = document.createElement('div');
    callContainer.id = 'callContainer';
    callContainer.className = 'fixed inset-0 bg-black z-50 hidden';
    callContainer.innerHTML = `
        <div class="relative w-full h-full">
            <!-- Remote Video -->
            <video id="remoteVideo" autoplay playsinline class="w-full h-full object-cover"></video>
            
            <!-- Local Video Preview -->
            <video id="localVideo" autoplay playsinline muted 
                class="absolute bottom-4 right-4 w-48 h-32 object-cover rounded-lg border-2 border-white shadow-lg"></video>
            
            <!-- Call Controls -->
            <div class="absolute bottom-8 left-1/2 transform -translate-x-1/2 flex space-x-4">
                <button id="muteBtn" class="w-16 h-16 bg-gray-600 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors">
                    <i class="fas fa-microphone"></i>
                </button>
                <button id="videoToggleBtn" class="w-16 h-16 bg-gray-600 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors">
                    <i class="fas fa-video"></i>
                </button>
                <button id="endCallBtn" class="w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors">
                    <i class="fas fa-phone"></i>
                </button>
            </div>
            
            <!-- Call Info -->
            <div class="absolute top-8 left-1/2 transform -translate-x-1/2 bg-black bg-opacity-50 text-white px-4 py-2 rounded-lg">
                <div id="callStatus" class="text-center">Connecting...</div>
                <div id="callTimer" class="text-center text-sm">00:00</div>
            </div>
        </div>
    `;
    document.body.appendChild(callContainer);
    console.log('✅ Call UI created and added to body');
}

// ==================== CALL MANAGEMENT ====================

async function startVoiceCallWithFriend(friendId, friendName) {
    try {
        if (isInCall) {
            showToast('You are already in a call', 'warning');
            return;
        }
        
        if (!callSpamProtection.canMakeCall()) {
            showToast('Please wait before making another call', 'warning');
            return;
        }
        
        const now = Date.now();
        if (now - lastCallTime < CALL_COOLDOWN) {
            showToast('Please wait before making another call', 'warning');
            return;
        }
        
        lastCallTime = now;
        
        console.log('📞 Starting voice call with:', friendName, friendId);
        
        // Set current chat for the call
        const chatId = [window.currentUser.uid, friendId].sort().join('_');
        window.currentChat = {
            id: chatId,
            friendId: friendId,
            name: friendName
        };
        
        // Create call document
        const callId = await createCallDoc(window.currentUser.uid, friendId, 'voice');
        
        if (!callId) {
            throw new Error('Failed to create call document');
        }
        
        showToast(`Calling ${friendName}...`, 'info');
        
        // Setup media and start call
        await setupMediaForCall('voice');
        await startCall(callId, friendId, friendName);
        
    } catch (error) {
        console.error('❌ Error starting voice call:', error);
        showToast('Error starting call: ' + error.message, 'error');
        lastCallTime = 0;
    }
}

async function startVideoCallWithFriend(friendId, friendName) {
    try {
        if (isInCall) {
            showToast('You are already in a call', 'warning');
            return;
        }
        
        if (!callSpamProtection.canMakeCall()) {
            showToast('Please wait before making another call', 'warning');
            return;
        }
        
        const now = Date.now();
        if (now - lastCallTime < CALL_COOLDOWN) {
            showToast('Please wait before making another call', 'warning');
            return;
        }
        
        lastCallTime = now;
        
        console.log('🎥 Starting video call with:', friendName, friendId);
        
        // Set current chat for the call
        const chatId = [window.currentUser.uid, friendId].sort().join('_');
        window.currentChat = {
            id: chatId,
            friendId: friendId,
            name: friendName
        };
        
        // Create call document
        const callId = await createCallDoc(window.currentUser.uid, friendId, 'video');
        
        if (!callId) {
            throw new Error('Failed to create call document');
        }
        
        showToast(`Starting video call with ${friendName}...`, 'info');
        
        // Setup media and start call
        await setupMediaForCall('video');
        await startCall(callId, friendId, friendName);
        
    } catch (error) {
        console.error('❌ Error starting video call:', error);
        showToast('Error starting call: ' + error.message, 'error');
        lastCallTime = 0;
    }
}

async function createCallDoc(callerId, calleeId, callType = 'voice') {
    try {
        if (!window.db) {
            throw new Error('Firebase database not available');
        }
        
        const callRef = window.db.collection('calls').doc();
        const callId = callRef.id;
        const payload = {
            callId: callId,
            callerId: callerId,
            callerName: window.currentUserData?.displayName || 'Unknown',
            calleeId: calleeId,
            callType: callType,
            status: 'ringing',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            participants: [callerId, calleeId]
        };
        
        await callRef.set(payload);
        console.log('📞 Call document created:', callId);
        return callId;
    } catch (err) {
        console.error('❌ createCallDoc error', err);
        throw err;
    }
}

// ==================== MEDIA MANAGEMENT ====================

async function setupMediaForCall(callType) {
    try {
        console.log('🎤 Setting up media for:', callType);
        
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true,
                channelCount: 1,
                sampleRate: 48000
            },
            video: callType === 'video' ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } : false
        };
        
        // Get user media
        localStream = await navigator.mediaDevices.getUserMedia(constraints);
        
        console.log('✅ Media streams obtained:', {
            audio: localStream.getAudioTracks().length,
            video: localStream.getVideoTracks().length
        });
        
        // Setup local video display
        if (callType === 'video') {
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = localStream;
                localVideo.muted = true;
                localVideo.play().catch(e => console.log('Local video play error:', e));
            }
        }
        
        return true;
        
    } catch (error) {
        console.error('❌ Error setting up media:', error);
        
        let errorMessage = 'Cannot access ';
        if (callType === 'video') {
            errorMessage += 'camera and microphone. ';
        } else {
            errorMessage += 'microphone. ';
        }
        
        if (error.name === 'NotAllowedError') {
            errorMessage += 'Please allow permissions in your browser settings.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += 'No camera/microphone found.';
        } else {
            errorMessage += error.message;
        }
        
        showToast(errorMessage, 'error');
        throw error;
    }
}

// ==================== WEBRTC IMPLEMENTATION ====================

async function startCall(callId, calleeId, calleeName) {
    try {
        // Close existing connection if any
        if (peerConnection) {
            try {
                peerConnection.close();
                console.warn('Existing peerConnection closed before starting a new call');
            } catch (e) {
                console.error('Error closing existing peerConnection:', e);
            }
            peerConnection = null;
        }

        // Set call state
        callState.isCaller = true;
        callState.callType = calleeName.includes('video') ? 'video' : 'voice';
        callState.remoteUserId = calleeId;
        callState.callId = callId;

        // Create WebRTC peer connection
        await createPeerConnection(callId, calleeId);

        // Show call UI
        setTimeout(() => {
            showCallUI(calleeName, callState.callType);
        }, 100);
        
        isInCall = true;
        showToast(`Calling ${calleeName}...`, 'success');

    } catch (err) {
        console.error('❌ startCall error', err);
        showToast('Error starting call', 'error');
        lastCallTime = 0;
    }
}

async function createPeerConnection(callId, calleeId) {
    try {
        if (!window.db) {
            throw new Error('Firebase database not available');
        }
        
        // Initialize peer connection
        peerConnection = new RTCPeerConnection(rtcConfig);
        console.log('✅ Peer connection created');

        // Add local tracks
        if (localStream) {
            localStream.getTracks().forEach(track => {
                console.log('➕ Adding local track:', track.kind, track.id);
                peerConnection.addTrack(track, localStream);
            });
        }

        // Handle remote tracks
        peerConnection.ontrack = (event) => {
            console.log('📹 Remote track received');
            remoteStream = (event.streams && event.streams[0]) || remoteStream || null;
            if (!remoteStream) return;

            if (callState?.callType === 'video') {
                const remoteVideo = document.getElementById('remoteVideo');
                if (remoteVideo) {
                    remoteVideo.srcObject = remoteStream;
                    remoteVideo.onloadedmetadata = () => {
                        remoteVideo.play().catch(e => console.warn('Remote video play error:', e));
                    };
                    remoteVideo.style.display = 'block';
                    console.log('✅ Remote video stream set');
                }
            }

            if (callState?.callType === 'voice') {
                let audioElem = document.getElementById('remoteAudio');
                if (!audioElem) {
                    audioElem = document.createElement('audio');
                    audioElem.id = 'remoteAudio';
                    audioElem.autoplay = true;
                    audioElem.hidden = true;
                    document.body.appendChild(audioElem);
                }
                try {
                    audioElem.srcObject = remoteStream;
                    audioElem.play().catch(e => console.warn('Remote audio play error:', e));
                    console.log('✅ Remote audio stream set');
                } catch (e) {
                    console.warn('Error assigning remote audio srcObject:', e);
                }
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (!event.candidate) return;

            const candidatePayload = {
                candidate: event.candidate.candidate,
                sdpMid: event.candidate.sdpMid,
                sdpMLineIndex: event.candidate.sdpMLineIndex,
                timestamp: Date.now()
            };

            const fieldName = callState?.isCaller ? 'callerCandidates' : 'calleeCandidates';
            const updateObj = {};
            updateObj[fieldName] = firebase.firestore.FieldValue.arrayUnion(candidatePayload);

            // Safe Firebase access
            if (window.db) {
                window.db.collection('calls').doc(callId).set(updateObj, { merge: true })
                    .catch(err => console.warn('Failed to store ICE candidate:', err));
            }
        };

        // Connection state monitoring
        peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', peerConnection.connectionState);
            switch (peerConnection.connectionState) {
                case 'connected':
                    showToast('Call connected successfully!', 'success');
                    updateCallStatus('Connected');
                    startCallTimer();
                    break;
                case 'disconnected':
                    console.warn('Call disconnected');
                    updateCallStatus('Disconnected');
                    break;
                case 'failed':
                    console.error('Call failed');
                    showToast('Call connection failed', 'error');
                    updateCallStatus('Failed');
                    break;
                case 'closed':
                    console.log('Call connection closed');
                    break;
            }
        };

        // Create and send offer
        const offerOptions = {
            offerToReceiveAudio: true,
            offerToReceiveVideo: callState?.callType === 'video',
            voiceActivityDetection: true,
            iceRestart: false
        };

        const offer = await peerConnection.createOffer(offerOptions);
        await peerConnection.setLocalDescription(offer);

        // Save offer to Firestore
        await window.db.collection('calls').doc(callId).set({
            offer: {
                type: offer.type,
                sdp: offer.sdp
            },
            status: 'ringing',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }, { merge: true });

        console.log('✅ WebRTC offer created and sent');

    } catch (error) {
        console.error('❌ Error creating peer connection:', error);
        showToast('Error establishing call connection: ' + error.message, 'error');
        throw error;
    }
}

// ==================== CALL CONTROLS ====================

function toggleMute() {
    if (!localStream) {
        showToast('No active call', 'error');
        return;
    }
    
    const audioTracks = localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        isMuted = !isMuted;
        audioTracks.forEach(track => {
            track.enabled = !isMuted;
        });
        
        updateCallButtons();
        showToast(isMuted ? 'Microphone muted' : 'Microphone unmuted', 'info');
    } else {
        showToast('No microphone available', 'error');
    }
}

function toggleVideo() {
    if (!localStream) {
        showToast('No active call', 'error');
        return;
    }
    
    const videoTracks = localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        isVideoOff = !isVideoOff;
        videoTracks.forEach(track => {
            track.enabled = !isVideoOff;
        });
        
        // Show/hide local video
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            localVideo.style.display = isVideoOff ? 'none' : 'block';
        }
        
        updateCallButtons();
        showToast(isVideoOff ? 'Video turned off' : 'Video turned on', 'info');
    } else {
        showToast('No camera available', 'error');
    }
}

function updateCallButtons() {
    const muteBtn = document.getElementById('muteBtn');
    const videoToggleBtn = document.getElementById('videoToggleBtn');
    
    if (muteBtn) {
        muteBtn.innerHTML = isMuted ? '<i class="fas fa-microphone-slash"></i>' : '<i class="fas fa-microphone"></i>';
        muteBtn.className = isMuted ? 
            'w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors' :
            'w-16 h-16 bg-gray-600 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors';
    }
    
    if (videoToggleBtn) {
        videoToggleBtn.innerHTML = isVideoOff ? '<i class="fas fa-video-slash"></i>' : '<i class="fas fa-video"></i>';
        videoToggleBtn.className = isVideoOff ?
            'w-16 h-16 bg-red-600 text-white rounded-full flex items-center justify-center hover:bg-red-700 transition-colors' :
            'w-16 h-16 bg-gray-600 text-white rounded-full flex items-center justify-center hover:bg-gray-700 transition-colors';
    }
}

// ==================== CALL UI MANAGEMENT ====================

function showCallUI(recipientName, callType) {
    const callContainer = document.getElementById('callContainer');
    const callStatus = document.getElementById('callStatus');
    
    if (!callContainer) {
        console.error('❌ Call container not found!');
        setupCallUI(); // Recreate UI if missing
        return;
    }
    
    if (callContainer && callStatus) {
        // Update call info
        callStatus.textContent = `${callType === 'video' ? 'Video' : 'Voice'} call with ${recipientName}`;
        
        // Remove hidden class and ensure display
        callContainer.classList.remove('hidden');
        callContainer.style.display = 'block';
        
        // Update UI based on call type
        const localVideo = document.getElementById('localVideo');
        const remoteVideo = document.getElementById('remoteVideo');
        
        if (callType === 'voice') {
            callContainer.classList.add('voice-call');
            callContainer.classList.remove('video-call');
            
            if (localVideo) {
                localVideo.style.display = 'flex';
                localVideo.innerHTML = '<div class="voice-avatar"><div class="voice-avatar-placeholder">📞</div></div>';
            }
            if (remoteVideo) {
                remoteVideo.style.display = 'flex';
                remoteVideo.innerHTML = `<div class="voice-avatar"><div class="voice-avatar-placeholder">${recipientName}</div></div>`;
            }
        } else {
            callContainer.classList.add('video-call');
            callContainer.classList.remove('voice-call');
            
            if (localVideo) {
                localVideo.style.display = 'block';
                localVideo.innerHTML = ''; // Clear placeholder
            }
            if (remoteVideo) {
                remoteVideo.style.display = 'block';
                remoteVideo.innerHTML = ''; // Clear placeholder
            }
        }
        
        console.log('✅ Call UI shown for:', callType, 'call with', recipientName);
    } else {
        console.error('❌ Call UI elements not found!');
    }
}

function hideCallUI() {
    const callContainer = document.getElementById('callContainer');
    if (callContainer) {
        callContainer.classList.add('hidden');
        callContainer.style.display = 'none';
        console.log('✅ Call UI hidden');
    }
}

function updateCallStatus(status) {
    const callStatus = document.getElementById('callStatus');
    if (callStatus) {
        callStatus.textContent = status;
    }
}

function startCallTimer() {
    const callTimer = document.getElementById('callTimer');
    if (!callTimer) return;
    
    let seconds = 0;
    callState.callStartTime = Date.now();
    
    callState.timerInterval = setInterval(() => {
        seconds++;
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds % 60;
        callTimer.textContent = `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
    }, 1000);
    
    console.log('⏱️ Call timer started');
}

function stopCallTimer() {
    if (callState.timerInterval) {
        clearInterval(callState.timerInterval);
        callState.timerInterval = null;
        console.log('⏱️ Call timer stopped');
    }
}

// ==================== CALL CLEANUP ====================

async function endCall() {
    try {
        console.log('📞 Ending call');
        
        // Stop call timer
        stopCallTimer();
        
        // Update call status in Firestore if available
        if (callState.callId && window.db) {
            await window.db.collection('calls').doc(callState.callId).update({
                status: 'ended',
                endedAt: firebase.firestore.FieldValue.serverTimestamp(),
                endedBy: window.currentUser.uid,
                reason: 'ended_by_user',
                duration: callState.callStartTime ? Math.floor((Date.now() - callState.callStartTime) / 1000) : 0
            });
        }
        
        // Clean up media streams
        if (localStream) {
            localStream.getTracks().forEach(track => track.stop());
            localStream = null;
            console.log('✅ Local stream cleaned up');
        }
        
        if (remoteStream) {
            remoteStream.getTracks().forEach(track => track.stop());
            remoteStream = null;
            console.log('✅ Remote stream cleaned up');
        }
        
        // Clean up peer connection
        if (peerConnection) {
            peerConnection.close();
            peerConnection = null;
            console.log('✅ Peer connection cleaned up');
        }
        
        // Reset call state
        callState = {
            isCaller: false,
            isReceivingCall: false,
            callType: null,
            remoteUserId: null,
            callId: null,
            callStartTime: null,
            timerInterval: null
        };
        
        isInCall = false;
        isMuted = false;
        isVideoOff = false;
        
        // Hide call UI
        hideCallUI();
        
        showToast('Call ended', 'info');
        console.log('✅ Call ended successfully');
        
    } catch (error) {
        console.error('❌ Error ending call:', error);
        showToast('Error ending call', 'error');
    }
}

// ==================== INCOMING CALL HANDLING ====================

function listenForIncomingCalls() {
    if (!window.currentUser || !window.currentUser.uid || !window.db) {
        console.warn('❌ Cannot listen for incoming calls - missing dependencies');
        return () => {};
    }

    console.log('👂 Listening for incoming calls for user:', window.currentUser.uid);

    const statuses = ['ringing', 'incoming', 'calling'];

    try {
        const query = window.db.collection('calls')
            .where('calleeId', '==', window.currentUser.uid)
            .where('status', 'in', statuses)
            .orderBy('createdAt', 'desc');

        return query.onSnapshot(snapshot => {
            if (!snapshot) return;

            snapshot.docChanges().forEach(change => {
                const callId = change.doc.id;
                const callData = change.doc.data();

                if (!callData || !callData.callerId) return;

                // If we already have a visible notification for this call, ignore duplicates
                if (window.activeCallNotifications && window.activeCallNotifications.has(callId)) {
                    console.log('📞 Notification already active for', callId);
                    return;
                }

                // Only act on added or modified where the status is still considered incoming
                if (change.type === 'added' || (change.type === 'modified' && statuses.includes(callData.status))) {
                    console.log('📞 Incoming call detected', callId, callData);

                    // Create notification
                    showIncomingCallNotification({
                        callId,
                        callerId: callData.callerId,
                        callerName: callData.callerName || callData.callerDisplayName || 'Unknown',
                        callType: callData.callType || 'voice',
                        offer: callData.offer || null
                    });
                }
            });
        }, error => {
            console.error('❌ Incoming call listener error', error);
        });
    } catch (err) {
        console.error('❌ Incoming call listener initialization error', err);
        return () => {};
    }
}

function showIncomingCallNotification({ callId, callerId, callerName, callType, offer }) {
    try {
        console.log('📞 Showing incoming call notification', callId, callerId, callType);

        // If already showing a notification for this callId, bring it to front
        if (window.activeCallNotifications.has(callId)) {
            const existing = window.activeCallNotifications.get(callId);
            if (existing && existing.container) {
                existing.container.style.zIndex = '10001';
            }
            return;
        }

        // Build container
        const container = document.createElement('div');
        container.classList.add('incoming-call-notification');
        container.setAttribute('data-call-id', callId);

        // Styling
        Object.assign(container.style, {
            position: 'fixed',
            top: '20px',
            right: '20px',
            zIndex: '10000',
            padding: '12px',
            background: 'rgba(0,0,0,0.85)',
            color: '#fff',
            borderRadius: '8px',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
            maxWidth: '320px',
            fontFamily: 'sans-serif'
        });

        // Content
        const title = document.createElement('div');
        title.textContent = callerName || 'Unknown Caller';
        title.style.fontWeight = '600';
        title.style.marginBottom = '6px';
        container.appendChild(title);

        const typeText = document.createElement('div');
        typeText.textContent = callType === 'video' ? 'Video call' : 'Audio call';
        typeText.style.marginBottom = '10px';
        container.appendChild(typeText);

        const btnRow = document.createElement('div');
        btnRow.style.display = 'flex';
        btnRow.style.gap = '8px';

        const answerBtn = document.createElement('button');
        answerBtn.textContent = 'Answer';
        answerBtn.className = 'btn-answer';
        answerBtn.style.flex = '1';
        answerBtn.style.padding = '8px 10px';
        answerBtn.style.border = 'none';
        answerBtn.style.borderRadius = '6px';
        answerBtn.style.cursor = 'pointer';
        answerBtn.style.background = '#16a34a';
        answerBtn.style.color = '#fff';

        const declineBtn = document.createElement('button');
        declineBtn.textContent = 'Decline';
        declineBtn.className = 'btn-decline';
        declineBtn.style.flex = '1';
        declineBtn.style.padding = '8px 10px';
        declineBtn.style.border = 'none';
        declineBtn.style.borderRadius = '6px';
        declineBtn.style.cursor = 'pointer';
        declineBtn.style.background = '#ef4444';
        declineBtn.style.color = '#fff';

        btnRow.appendChild(answerBtn);
        btnRow.appendChild(declineBtn);
        container.appendChild(btnRow);

        document.body.appendChild(container);

        // Play ringtone
        playCallRingtone();

        // Auto-decline after timeout
        const AUTO_DECLINE_MS = 30000;
        const timeoutId = setTimeout(async () => {
            try {
                console.log('📞 Auto-decline timeout for', callId);
                await declineIncomingCall(callId);
            } catch (err) {
                console.warn('📞 Auto-decline error', err);
            }
            cleanup();
        }, AUTO_DECLINE_MS);

        function cleanup() {
            clearTimeout(timeoutId);
            if (container.parentNode) container.parentNode.removeChild(container);
            window.activeCallNotifications.delete(callId);
        }

        answerBtn.addEventListener('click', async () => {
            try {
                cleanup();
                await answerIncomingCall(callId, callerId, callType);
            } catch (err) {
                console.error('❌ Answer button error', err);
            }
        });

        declineBtn.addEventListener('click', async () => {
            try {
                cleanup();
                await declineIncomingCall(callId);
            } catch (err) {
                console.error('❌ Decline button error', err);
            }
        });

        // Save to map
        window.activeCallNotifications.set(callId, { container, timeoutId, cleanup });

        // Cleanup if too many notifications
        if (window.activeCallNotifications.size > 5) {
            const firstKey = window.activeCallNotifications.keys().next().value;
            const first = window.activeCallNotifications.get(firstKey);
            if (first && typeof first.cleanup === 'function') first.cleanup();
        }

        return container;
    } catch (err) {
        console.error('❌ Incoming call notification fatal error', err);
    }
}

async function answerIncomingCall(callId, callerId, callType) {
    try {
        console.log('📞 Answering call:', callId);
        
        // Check spam protection
        if (!callSpamProtection.canMakeCall()) {
            showToast('Please wait before answering another call', 'warning');
            return;
        }
        
        // Ensure media access
        if (!localStream) {
            localStream = await navigator.mediaDevices.getUserMedia({
                audio: true,
                video: callType === 'video'
            });
        }
        
        // Remove notification
        const notification = document.querySelector('.incoming-call-notification');
        if (notification) {
            notification.remove();
        }
        
        // Update call status
        if (window.db) {
            await window.db.collection('calls').doc(callId).update({
                status: 'answered',
                answeredAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        }
        
        // Set current chat to caller
        if (window.db) {
            const callerDoc = await window.db.collection('users').doc(callerId).get();
            if (callerDoc.exists) {
                const callerData = callerDoc.data();
                window.currentChat = {
                    id: [window.currentUser.uid, callerId].sort().join('_'),
                    friendId: callerId,
                    name: callerData.displayName || 'Caller'
                };
            }
        }
        
        showToast('Call answered! Connecting...', 'success');
        
        // Start the call
        callState.callType = callType;
        callState.isCaller = false;
        callState.remoteUserId = callerId;
        callState.callId = callId;
        
        // Show call UI
        showCallUI('Caller', callType);
        isInCall = true;
        
        console.log('✅ Incoming call answered');
        
    } catch (error) {
        console.error('❌ Error answering call:', error);
        showToast('Error answering call', 'error');
    }
}

async function declineIncomingCall(callId) {
    try {
        console.log('📞 Declining call:', callId);
        
        // Clean up notification
        if (window.activeCallNotifications.has(callId)) {
            const notification = window.activeCallNotifications.get(callId);
            if (notification && typeof notification.cleanup === 'function') {
                notification.cleanup();
            }
        }
        
        // Update call status to rejected
        if (window.db) {
            await window.db.collection('calls').doc(callId).update({
                status: 'rejected',
                endedAt: firebase.firestore.FieldValue.serverTimestamp(),
                endedBy: window.currentUser.uid,
                reason: 'declined'
            });
        }
        
        console.log('✅ Call declined successfully');
        showToast('Call declined', 'info');
        
    } catch (error) {
        console.error('❌ Error declining call:', error);
        showToast('Error declining call', 'error');
    }
}

// ==================== UTILITY FUNCTIONS ====================

function playCallRingtone() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.type = 'sine';
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        
        oscillator.start();
        setTimeout(() => { oscillator.stop(); }, 500);
        
    } catch (error) {
        console.log('🔕 Could not play ringtone:', error);
    }
}

// ==================== GLOBAL EXPORTS ====================

// Make functions globally available
window.startVoiceCallWithFriend = startVoiceCallWithFriend;
window.startVideoCallWithFriend = startVideoCallWithFriend;
window.initializeCallSystem = initializeCallSystem;
window.toggleMute = toggleMute;
window.toggleVideo = toggleVideo;
window.endCall = endCall;
window.answerIncomingCall = answerIncomingCall;
window.declineIncomingCall = declineIncomingCall;
window.onUserAuthenticated = onUserAuthenticated;

// Update the DOMContentLoaded to use the new initialization:
document.addEventListener('DOMContentLoaded', function() {
    console.log('📞 call.js DOM loaded');
    
    // Wait for Firebase and user authentication
    const checkReady = setInterval(() => {
        if (window.db && window.firebase) {
            clearInterval(checkReady);
            console.log('✅ Firebase available, waiting for user authentication...');
            
            // Start the smart initialization
            initializeCallSystemWhenReady();
        }
    }, 500);
    
    // Timeout after 15 seconds
    setTimeout(() => {
        clearInterval(checkReady);
        if (!window.db) {
            console.error('❌ Firebase initialization timeout in call.js');
        }
    }, 15000);
});

console.log('✅ calls.js loaded successfully');

// Add this function to test the call UI manually
function testCallUI() {
    console.log('🧪 Testing Call UI...');
    setupCallUI();
    showCallUI('Test User', 'video');
    
    // Simulate local video
    const localVideo = document.getElementById('localVideo');
    if (localVideo) {
        // Create a test video stream (will show black if no camera)
        navigator.mediaDevices.getUserMedia({ video: true, audio: false })
            .then(stream => {
                localVideo.srcObject = stream;
                console.log('✅ Test local video stream added');
            })
            .catch(err => {
                console.log('⚠️ No camera available for test, using placeholder');
                // Add placeholder for testing
                localVideo.style.background = 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)';
                localVideo.innerHTML = '<div style="color: white; font-size: 1.2rem; display: flex; align-items: center; justify-content: center; height: 100%;">Local Video</div>';
            });
    }
}

// Make it available globally for testing
window.testCallUI = testCallUI;