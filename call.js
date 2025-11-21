// call.js - WebRTC Voice/Video Calling System for Kynecta
// Requires: Firebase v8 SDK loaded via CDN, chat.js for user data
// HTML IDs required: 
//   - incomingCallPopup, incomingCallerName, incomingCallType
//   - acceptCallBtn, rejectCallBtn, endCallBtn
//   - callContainer, callStatus, callTimer, remoteVideo, localVideo
//   - toggleMicBtn, toggleCameraBtn, switchCameraBtn

// Global state for call management
window.callState = {
    isCaller: false,
    isReceivingCall: false,
    callType: null,
    remoteUserId: null,
    callId: null,
    callStartTime: null,
    timerInterval: null,
    unsubscribers: [],
    currentUser: null,
    localStream: null,
    remoteStream: null,
    peerConnection: null,
    isMuted: false,
    isVideoOff: false,
    isInCall: false,
    currentCamera: 'user',
    ringtoneUrl: null // Custom ringtone support
};

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" },
        { 
            urls: "turn:global.relay.metered.ca:80", 
            username: "8ad75c0a0a7dc7e8f8e9c4f9", 
            credential: "7r9O6r5P6uL3pP5p" 
        },
        { 
            urls: "turn:global.relay.metered.ca:443", 
            username: "8ad75c0a0a7dc7e8f8e9c4f9", 
            credential: "7r9O6r5P6uL3pP5p" 
        }
    ]
};

// Initialize call system when user is authenticated
window.initializeCallSystem = function() {
    console.log('🔧 Initializing call system...');
    
    // Clean up any existing state first
    cleanupCallSystem();
    
    // Wait for Firebase to be available
    if (!window.firebase || !window.firebase.auth) {
        console.warn('Firebase not loaded yet, retrying in 1 second...');
        setTimeout(initializeCallSystem, 1000);
        return;
    }
    
    // Set up auth state listener
    firebase.auth().onAuthStateChanged((user) => {
        if (user) {
            console.log('✅ User authenticated, setting up call system for:', user.uid);
            window.callState.currentUser = user;
            setupCallEventListeners();
            listenForIncomingCalls();
            addCallButtonsToFriendList();
            addCallButtonsToChat();
            loadUserPreferences();
            
            // Clean up any old calls for this user
            cleanupOldCalls(user.uid);
        } else {
            console.log('❌ User not authenticated, cleaning up call system');
            cleanupCallSystem();
        }
    });
};

// Clean up old calls from Firestore
async function cleanupOldCalls(userId) {
    try {
        console.log('🧹 Cleaning up old calls for user:', userId);
        
        const callsSnapshot = await firebase.firestore().collection('calls')
            .where('status', 'in', ['ringing', 'answered'])
            .where('createdAt', '>', new Date(Date.now() - 30 * 60 * 1000)) // Last 30 minutes
            .get();
            
        const cleanupPromises = [];
        
        callsSnapshot.forEach((doc) => {
            const callData = doc.data();
            const callAge = Date.now() - (callData.createdAt?.toDate?.()?.getTime() || Date.now());
            
            // Clean up calls older than 5 minutes or involving current user
            if (callAge > 5 * 60 * 1000 || 
                callData.callerId === userId || 
                callData.receiverId === userId) {
                cleanupPromises.push(
                    firebase.firestore().collection('calls').doc(doc.id).update({
                        status: 'ended',
                        reason: 'cleanup',
                        endedAt: firebase.firestore.FieldValue.serverTimestamp()
                    })
                );
            }
        });
        
        if (cleanupPromises.length > 0) {
            await Promise.all(cleanupPromises);
            console.log(`✅ Cleaned up ${cleanupPromises.length} old calls`);
        }
    } catch (error) {
        console.error('❌ Error cleaning up old calls:', error);
    }
}

function setupCallEventListeners() {
    console.log('🔧 Setting up call event listeners');
    
    // Remove any existing listeners first
    document.removeEventListener('click', handleCallButtonClicks);
    
    // Add new event listener
    document.addEventListener('click', handleCallButtonClicks);
    
    console.log('✅ Call event listeners setup complete');
}

// Centralized click handler for call buttons
function handleCallButtonClicks(e) {
    // Accept call button
    if (e.target.closest('#acceptCallBtn')) {
        console.log('✅ Accept call button clicked');
        if (window.callState.isReceivingCall && window.callState.callId) {
            acceptCall(window.callState.callId, window.callState.remoteUserId, window.callState.callType);
        }
        return;
    }
    
    // Reject call button
    if (e.target.closest('#rejectCallBtn')) {
        console.log('❌ Reject call button clicked');
        if (window.callState.callId) {
            rejectCall(window.callState.callId);
        } else {
            hideIncomingCallPopup();
            cleanupCallState();
        }
        return;
    }
    
    // End call button
    if (e.target.closest('#endCallBtn')) {
        console.log('📞 End call button clicked');
        endCall();
        return;
    }
    
    // Toggle microphone
    if (e.target.closest('#toggleMicBtn')) {
        console.log('🎤 Toggle mic button clicked');
        toggleMic();
        return;
    }
    
    // Toggle camera
    if (e.target.closest('#toggleCameraBtn')) {
        console.log('📷 Toggle camera button clicked');
        toggleCamera();
        return;
    }
    
    // Switch camera
    if (e.target.closest('#switchCameraBtn')) {
        console.log('🔄 Switch camera button clicked');
        switchCamera();
        return;
    }
}

// Load user preferences including custom ringtone
function loadUserPreferences() {
    try {
        const savedRingtone = localStorage.getItem('kynecta_ringtone_url');
        if (savedRingtone) {
            window.callState.ringtoneUrl = savedRingtone;
            console.log('🔔 Loaded custom ringtone:', savedRingtone);
        }
    } catch (error) {
        console.warn('⚠️ Could not load user preferences:', error);
    }
}

// Save custom ringtone URL
window.setCustomRingtone = function(url) {
    try {
        // Validate URL
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid ringtone URL');
        }
        
        // Test if it's a valid audio URL
        const audio = new Audio();
        audio.src = url;
        audio.onerror = () => {
            throw new Error('Invalid audio file URL');
        };
        
        window.callState.ringtoneUrl = url;
        localStorage.setItem('kynecta_ringtone_url', url);
        console.log('✅ Custom ringtone saved:', url);
        showToast('Custom ringtone set successfully', 'success');
        
    } catch (error) {
        console.error('❌ Error setting custom ringtone:', error);
        showToast('Failed to set custom ringtone: ' + error.message, 'error');
    }
};

// Reset to default ringtone
window.resetToDefaultRingtone = function() {
    window.callState.ringtoneUrl = null;
    localStorage.removeItem('kynecta_ringtone_url');
    console.log('✅ Ringtone reset to default');
    showToast('Ringtone reset to default', 'info');
};

// Main call initiation function
window.startCall = async function(friendId, friendName, callType = 'voice') {
    console.log('📞 Starting call with:', friendName, friendId, 'Type:', callType);
    
    // Prevent multiple calls
    if (window.callState.isInCall) {
        console.warn('❌ Already in a call, cannot start new call');
        showToast('You are already in a call', 'warning');
        return;
    }
    
    // Validate parameters
    if (!friendId || !friendName) {
        console.error('❌ Missing friendId or friendName');
        showToast('Cannot start call: missing contact information', 'error');
        return;
    }
    
    try {
        // Set call state
        window.callState.isCaller = true;
        window.callState.remoteUserId = friendId;
        window.callState.callType = callType;
        window.callState.isInCall = true;
        
        // Generate unique call ID
        const callId = `call_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
        window.callState.callId = callId;
        
        console.log('🆔 Call ID generated:', callId);
        
        // Create call document in Firestore
        await firebase.firestore().collection('calls').doc(callId).set({
            callId: callId,
            callerId: window.callState.currentUser.uid,
            callerName: window.currentUserData?.displayName || 'Unknown User',
            receiverId: friendId,
            callType: callType,
            status: 'ringing',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            callerCandidates: [],
            receiverCandidates: []
        });
        
        console.log('✅ Call document created in Firestore');
        
        // Get local media stream
        await getLocalMediaStream(callType);
        
        // Create peer connection
        await createPeerConnection();
        
        // Create and send offer
        await createAndSendOffer(callId);
        
        // Show call UI
        showCallUI(friendName, callType);
        
        // Start ringtone for outgoing call
        playRingtone();
        
        console.log('✅ Call initiation complete, waiting for answer...');
        
    } catch (error) {
        console.error('❌ Error starting call:', error);
        showToast('Failed to start call: ' + error.message, 'error');
        cleanupCallState();
    }
};

// Get local media stream based on call type
async function getLocalMediaStream(callType) {
    console.log('🎥 Getting local media stream for:', callType);
    
    try {
        const constraints = {
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                autoGainControl: true
            },
            video: callType === 'video' ? {
                width: { ideal: 1280 },
                height: { ideal: 720 },
                frameRate: { ideal: 30 }
            } : false
        };
        
        window.callState.localStream = await navigator.mediaDevices.getUserMedia(constraints);
        console.log('✅ Local media stream obtained');
        
        // Display local video if it's a video call
        if (callType === 'video' && window.callState.localStream) {
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                localVideo.srcObject = window.callState.localStream;
                localVideo.muted = true;
                localVideo.play().catch(e => console.warn('Local video play error:', e));
            }
        }
        
    } catch (error) {
        console.error('❌ Error getting media stream:', error);
        
        let errorMessage = 'Cannot access ';
        if (callType === 'video') {
            errorMessage += 'camera and microphone';
        } else {
            errorMessage += 'microphone';
        }
        
        if (error.name === 'NotAllowedError') {
            errorMessage += '. Please allow permissions in your browser settings.';
        } else if (error.name === 'NotFoundError') {
            errorMessage += '. No media devices found.';
        } else if (error.name === 'NotReadableError') {
            errorMessage += '. Device may be in use by another application.';
        } else {
            errorMessage += ': ' + error.message;
        }
        
        throw new Error(errorMessage);
    }
}

// Create WebRTC peer connection
async function createPeerConnection() {
    console.log('🔗 Creating peer connection');
    
    try {
        window.callState.peerConnection = new RTCPeerConnection(rtcConfig);
        
        // Add local stream tracks to peer connection
        if (window.callState.localStream) {
            window.callState.localStream.getTracks().forEach(track => {
                window.callState.peerConnection.addTrack(track, window.callState.localStream);
            });
        }
        
        // Set up remote stream handler
        window.callState.peerConnection.ontrack = (event) => {
            console.log('📹 Remote track received');
            const remoteVideo = document.getElementById('remoteVideo');
            if (remoteVideo && event.streams[0]) {
                window.callState.remoteStream = event.streams[0];
                remoteVideo.srcObject = window.callState.remoteStream;
                remoteVideo.play().catch(e => console.warn('Remote video play error:', e));
            }
        };
        
        // ICE candidate handler
        window.callState.peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('❄️  Local ICE candidate generated');
                sendIceCandidate(event.candidate);
            }
        };
        
        // Connection state handler
        window.callState.peerConnection.onconnectionstatechange = () => {
            console.log('🔗 Connection state:', window.callState.peerConnection.connectionState);
            updateCallStatus(window.callState.peerConnection.connectionState);
            
            // Auto-cleanup on failure
            if (window.callState.peerConnection.connectionState === 'failed') {
                console.error('❌ Connection failed, cleaning up');
                showToast('Connection failed', 'error');
                endCall();
            }
        };
        
        // Handle ICE connection state
        window.callState.peerConnection.oniceconnectionstatechange = () => {
            console.log('❄️ ICE connection state:', window.callState.peerConnection.iceConnectionState);
            
            if (window.callState.peerConnection.iceConnectionState === 'failed') {
                console.error('❌ ICE connection failed');
                showToast('Network connection failed', 'error');
                endCall();
            }
        };
        
        console.log('✅ Peer connection created successfully');
        
    } catch (error) {
        console.error('❌ Error creating peer connection:', error);
        throw new Error('Failed to establish connection: ' + error.message);
    }
}

// Create and send offer to remote peer
async function createAndSendOffer(callId) {
    console.log('📤 Creating and sending offer');
    
    try {
        const offer = await window.callState.peerConnection.createOffer();
        await window.callState.peerConnection.setLocalDescription(offer);
        
        // Send offer to Firestore
        await firebase.firestore().collection('calls').doc(callId).update({
            offer: offer,
            status: 'ringing',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Offer sent to Firestore');
        
        // Listen for answer and ICE candidates
        setupCallListeners(callId);
        
    } catch (error) {
        console.error('❌ Error creating/sending offer:', error);
        throw new Error('Failed to create call offer: ' + error.message);
    }
}

// Set up Firestore listeners for call updates
function setupCallListeners(callId) {
    console.log('👂 Setting up call listeners for:', callId);
    
    // Clean up any existing listeners first
    cleanupCallListeners();
    
    // Listen for answer
    const answerUnsub = firebase.firestore().collection('calls').doc(callId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const callData = doc.data();
                
                // Handle answer
                if (callData.answer && window.callState.isCaller) {
                    console.log('✅ Answer received');
                    handleAnswer(callData.answer);
                }
                
                // Handle call rejection or end
                if (callData.status === 'rejected' || callData.status === 'ended') {
                    console.log('📞 Call rejected or ended by remote party');
                    endCall();
                    showToast('Call ended', 'info');
                }
            }
        });
    
    // Listen for receiver ICE candidates
    const candidateUnsub = firebase.firestore().collection('calls').doc(callId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const callData = doc.data();
                if (callData.receiverCandidates && window.callState.isCaller) {
                    handleRemoteIceCandidates(callData.receiverCandidates);
                }
            }
        });
    
    // Store unsubscribe functions
    window.callState.unsubscribers.push(answerUnsub, candidateUnsub);
}

// Handle incoming answer from receiver
async function handleAnswer(answer) {
    console.log('🔄 Handling answer from receiver');
    
    try {
        await window.callState.peerConnection.setRemoteDescription(answer);
        console.log('✅ Remote description set from answer');
        stopRingtone();
        startCallTimer();
        
    } catch (error) {
        console.error('❌ Error handling answer:', error);
        showToast('Error establishing connection', 'error');
        endCall();
    }
}

// Send ICE candidate to remote peer
async function sendIceCandidate(candidate) {
    console.log('📤 Sending ICE candidate');
    
    if (!window.callState.callId) return;
    
    try {
        const candidateData = {
            candidate: candidate.candidate,
            sdpMid: candidate.sdpMid,
            sdpMLineIndex: candidate.sdpMLineIndex
        };
        
        const field = window.callState.isCaller ? 'callerCandidates' : 'receiverCandidates';
        
        await firebase.firestore().collection('calls').doc(window.callState.callId).update({
            [field]: firebase.firestore.FieldValue.arrayUnion(candidateData)
        });
        
    } catch (error) {
        console.error('❌ Error sending ICE candidate:', error);
    }
}

// Handle remote ICE candidates
async function handleRemoteIceCandidates(candidates) {
    console.log('👂 Handling remote ICE candidates:', candidates.length);
    
    const processedCandidates = new Set();
    
    for (const candidateData of candidates) {
        const candidateKey = `${candidateData.sdpMid}-${candidateData.sdpMLineIndex}-${candidateData.candidate}`;
        
        if (!processedCandidates.has(candidateKey)) {
            processedCandidates.add(candidateKey);
            
            try {
                const candidate = new RTCIceCandidate(candidateData);
                await window.callState.peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.warn('⚠️ Error adding ICE candidate:', error);
            }
        }
    }
}

// Listen for incoming calls with better cleanup
window.listenForIncomingCalls = function() {
    console.log('👂 Listening for incoming calls');
    
    if (!window.callState.currentUser) {
        console.warn('❌ No current user, cannot listen for calls');
        return;
    }
    
    // Clean up any existing listeners first
    cleanupCallListeners();
    
    const incomingCallsUnsub = firebase.firestore().collection('calls')
        .where('receiverId', '==', window.callState.currentUser.uid)
        .where('status', 'in', ['ringing', 'answered'])
        .onSnapshot((snapshot) => {
            snapshot.docChanges().forEach((change) => {
                if (change.type === 'added') {
                    const callData = change.doc.data();
                    
                    // Skip old calls (older than 5 minutes)
                    const callAge = Date.now() - (callData.createdAt?.toDate?.()?.getTime() || Date.now());
                    if (callAge > 5 * 60 * 1000) {
                        console.log('⏰ Skipping old call:', callData.callId);
                        return;
                    }
                    
                    console.log('📞 Incoming call from:', callData.callerName, 'Status:', callData.status);
                    
                    if (callData.status === 'ringing') {
                        // Only show popup if not already in a call
                        if (!window.callState.isInCall) {
                            showIncomingCallPopup(callData.callerName, callData.callType, callData.callId, callData.callerId);
                        }
                    }
                }
            });
        }, (error) => {
            console.error('❌ Error in incoming calls listener:', error);
        });
    
    window.callState.unsubscribers.push(incomingCallsUnsub);
};

// Show incoming call popup
function showIncomingCallPopup(callerName, callType, callId, callerId) {
    console.log('🪟 Showing incoming call popup');
    
    window.callState.isReceivingCall = true;
    window.callState.callId = callId;
    window.callState.remoteUserId = callerId;
    window.callState.callType = callType;
    
    const popup = document.getElementById('incomingCallPopup');
    const callerNameEl = document.getElementById('incomingCallerName');
    const callTypeEl = document.getElementById('incomingCallType');
    
    if (popup && callerNameEl && callTypeEl) {
        callerNameEl.textContent = callerName;
        callTypeEl.textContent = callType === 'video' ? 'Video Call' : 'Voice Call';
        popup.style.display = 'flex';
        popup.style.zIndex = '10000';
    }
    
    playRingtone();
}

// Hide incoming call popup
function hideIncomingCallPopup() {
    console.log('🪟 Hiding incoming call popup');
    
    const popup = document.getElementById('incomingCallPopup');
    if (popup) {
        popup.style.display = 'none';
    }
    
    window.callState.isReceivingCall = false;
    stopRingtone();
}

// Accept incoming call
window.acceptCall = async function(callId, callerId, callType) {
    console.log('✅ Accepting call:', callId);
    
    if (!callId || !callerId) {
        console.error('❌ Missing callId or callerId');
        return;
    }
    
    try {
        window.callState.isCaller = false;
        window.callState.remoteUserId = callerId;
        window.callState.callId = callId;
        window.callState.callType = callType;
        window.callState.isInCall = true;
        
        // Hide incoming popup
        hideIncomingCallPopup();
        
        // Get local media
        await getLocalMediaStream(callType);
        
        // Create peer connection
        await createPeerConnection();
        
        // Get call data and set remote description
        const callDoc = await firebase.firestore().collection('calls').doc(callId).get();
        if (callDoc.exists) {
            const callData = callDoc.data();
            
            if (callData.offer) {
                await window.callState.peerConnection.setRemoteDescription(callData.offer);
                
                // Create and send answer
                const answer = await window.callState.peerConnection.createAnswer();
                await window.callState.peerConnection.setLocalDescription(answer);
                
                await firebase.firestore().collection('calls').doc(callId).update({
                    answer: answer,
                    status: 'answered',
                    updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log('✅ Answer sent');
                
                // Set up listeners for ICE candidates
                setupAnswerListeners(callId);
                
                // Show call UI
                showCallUI(callData.callerName, callType);
                startCallTimer();
            }
        }
        
    } catch (error) {
        console.error('❌ Error accepting call:', error);
        showToast('Failed to accept call: ' + error.message, 'error');
        cleanupCallState();
    }
};

// Set up listeners for answer flow
function setupAnswerListeners(callId) {
    console.log('👂 Setting up answer listeners');
    
    // Listen for caller ICE candidates
    const candidateUnsub = firebase.firestore().collection('calls').doc(callId)
        .onSnapshot((doc) => {
            if (doc.exists) {
                const callData = doc.data();
                if (callData.callerCandidates && !window.callState.isCaller) {
                    handleRemoteIceCandidates(callData.callerCandidates);
                }
                
                // Handle call end
                if (callData.status === 'ended') {
                    console.log('📞 Call ended by remote party');
                    endCall();
                    showToast('Call ended', 'info');
                }
            }
        });
    
    window.callState.unsubscribers.push(candidateUnsub);
}

// Reject incoming call
window.rejectCall = async function(callId) {
    console.log('❌ Rejecting call:', callId);
    
    try {
        await firebase.firestore().collection('calls').doc(callId).update({
            status: 'rejected',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideIncomingCallPopup();
        cleanupCallState();
        showToast('Call rejected', 'info');
        
    } catch (error) {
        console.error('❌ Error rejecting call:', error);
        // Still clean up local state even if Firestore update fails
        hideIncomingCallPopup();
        cleanupCallState();
        showToast('Call rejected', 'info');
    }
};

// End current call
window.endCall = async function() {
    console.log('📞 Ending call');
    
    const callId = window.callState.callId;
    if (!callId) {
        console.warn('⚠️ No active call to end');
        return;
    }
    
    try {
        // Update call status in Firestore
        await firebase.firestore().collection('calls').doc(callId).update({
            status: 'ended',
            endedBy: window.callState.currentUser.uid,
            endedAt: firebase.firestore.FieldValue.serverTimestamp(),
            duration: window.callState.callStartTime ? Date.now() - window.callState.callStartTime : 0
        });
        
    } catch (error) {
        console.error('❌ Error updating call end status:', error);
    }
    
    // Clean up UI and state
    hideCallUI();
    cleanupCallState();
    showToast('Call ended', 'info');
};

// Toggle microphone mute
window.toggleMic = function() {
    if (!window.callState.localStream) return;
    
    const audioTracks = window.callState.localStream.getAudioTracks();
    if (audioTracks.length > 0) {
        window.callState.isMuted = !window.callState.isMuted;
        audioTracks.forEach(track => {
            track.enabled = !window.callState.isMuted;
        });
        
        const toggleMicBtn = document.getElementById('toggleMicBtn');
        if (toggleMicBtn) {
            toggleMicBtn.textContent = window.callState.isMuted ? '🎤' : '🔇';
            toggleMicBtn.title = window.callState.isMuted ? 'Unmute' : 'Mute';
        }
        
        console.log('🎤 Microphone', window.callState.isMuted ? 'muted' : 'unmuted');
    }
};

// Toggle camera on/off
window.toggleCamera = function() {
    if (!window.callState.localStream || window.callState.callType !== 'video') return;
    
    const videoTracks = window.callState.localStream.getVideoTracks();
    if (videoTracks.length > 0) {
        window.callState.isVideoOff = !window.callState.isVideoOff;
        videoTracks.forEach(track => {
            track.enabled = !window.callState.isVideoOff;
        });
        
        const toggleCameraBtn = document.getElementById('toggleCameraBtn');
        if (toggleCameraBtn) {
            toggleCameraBtn.textContent = window.callState.isVideoOff ? '📹' : '📷';
            toggleCameraBtn.title = window.callState.isVideoOff ? 'Turn camera on' : 'Turn camera off';
        }
        
        console.log('📷 Camera', window.callState.isVideoOff ? 'off' : 'on');
    }
};

// Switch between front and back cameras
window.switchCamera = async function() {
    if (!window.callState.localStream || window.callState.callType !== 'video') return;
    
    try {
        const videoTrack = window.callState.localStream.getVideoTracks()[0];
        if (!videoTrack) return;
        
        // Get available cameras
        const devices = await navigator.mediaDevices.enumerateDevices();
        const videoDevices = devices.filter(device => device.kind === 'videoinput');
        
        if (videoDevices.length < 2) {
            console.warn('⚠️ Only one camera available');
            showToast('Only one camera available', 'info');
            return;
        }
        
        // Determine next camera
        const currentFacingMode = window.callState.currentCamera;
        const newFacingMode = currentFacingMode === 'user' ? 'environment' : 'user';
        window.callState.currentCamera = newFacingMode;
        
        // Stop current video track
        videoTrack.stop();
        
        // Get new video stream
        const newStream = await navigator.mediaDevices.getUserMedia({
            video: {
                facingMode: newFacingMode,
                width: { ideal: 1280 },
                height: { ideal: 720 }
            },
            audio: true
        });
        
        // Replace video track in local stream
        const newVideoTrack = newStream.getVideoTracks()[0];
        const sender = window.callState.peerConnection.getSenders().find(
            s => s.track && s.track.kind === 'video'
        );
        
        if (sender) {
            await sender.replaceTrack(newVideoTrack);
        }
        
        // Update local video element
        const localVideo = document.getElementById('localVideo');
        if (localVideo) {
            // Remove old tracks and add new ones
            window.callState.localStream.getVideoTracks().forEach(track => track.stop());
            window.callState.localStream.addTrack(newVideoTrack);
            localVideo.srcObject = window.callState.localStream;
        }
        
        // Stop the audio tracks from the new stream (we keep our existing audio)
        newStream.getAudioTracks().forEach(track => track.stop());
        
        console.log('📷 Switched camera to:', newFacingMode);
        showToast('Camera switched', 'success');
        
    } catch (error) {
        console.error('❌ Error switching camera:', error);
        showToast('Failed to switch camera', 'error');
    }
};

// Show call UI
function showCallUI(recipientName, callType) {
    console.log('🖥️ Showing call UI for:', recipientName);
    
    const callContainer = document.getElementById('callContainer');
    const callStatus = document.getElementById('callStatus');
    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo = document.getElementById('localVideo');
    
    if (callContainer) {
        callContainer.style.display = 'flex';
        callContainer.style.zIndex = '10000';
    }
    
    if (callStatus) {
        callStatus.textContent = `Calling ${recipientName}...`;
    }
    
    // Adjust UI based on call type
    if (callType === 'video') {
        if (remoteVideo) remoteVideo.style.display = 'block';
        if (localVideo) localVideo.style.display = 'block';
    } else {
        if (remoteVideo) remoteVideo.style.display = 'none';
        if (localVideo) localVideo.style.display = 'none';
    }
}

// Hide call UI
function hideCallUI() {
    console.log('🖥️ Hiding call UI');
    
    const callContainer = document.getElementById('callContainer');
    if (callContainer) {
        callContainer.style.display = 'none';
    }
    
    hideIncomingCallPopup();
    stopCallTimer();
}

// Update call status display
function updateCallStatus(status) {
    const callStatus = document.getElementById('callStatus');
    if (callStatus) {
        const statusMap = {
            'connecting': 'Connecting...',
            'connected': 'Connected',
            'disconnected': 'Disconnected',
            'failed': 'Connection Failed',
            'closed': 'Call Ended'
        };
        
        callStatus.textContent = statusMap[status] || status;
    }
}

// Start call timer
function startCallTimer() {
    console.log('⏱️ Starting call timer');
    
    window.callState.callStartTime = Date.now();
    stopCallTimer(); // Clear any existing timer
    
    const callTimer = document.getElementById('callTimer');
    if (!callTimer) return;
    
    window.callState.timerInterval = setInterval(() => {
        const elapsed = Date.now() - window.callState.callStartTime;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        callTimer.textContent = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }, 1000);
}

// Stop call timer
function stopCallTimer() {
    if (window.callState.timerInterval) {
        clearInterval(window.callState.timerInterval);
        window.callState.timerInterval = null;
    }
    
    const callTimer = document.getElementById('callTimer');
    if (callTimer) {
        callTimer.textContent = '00:00';
    }
}

// Enhanced ringtone with custom URL support
function playRingtone() {
    // Only play ringtone after user has interacted with the page
    if (!window.userInteracted) {
        console.log('🔕 Ringtone skipped - user hasn\'t interacted with page yet');
        return;
    }
    
    let ringtone = document.getElementById('callRingtone');
    if (!ringtone) {
        ringtone = document.createElement('audio');
        ringtone.id = 'callRingtone';
        ringtone.loop = true;
        document.body.appendChild(ringtone);
    }
    
    // Use custom ringtone if available, otherwise fallback
    if (window.callState.ringtoneUrl) {
        ringtone.src = window.callState.ringtoneUrl;
        console.log('🔔 Using custom ringtone:', window.callState.ringtoneUrl);
    } else {
        // Use default ringtone
        ringtone.innerHTML = `
            <source src="/sounds/ringtone.mp3" type="audio/mpeg">
            <source src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmUgBjiN1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmUgBjiN1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmUgBjiN1/LMeSw=" type="audio/wav">
        `;
        console.log('🔔 Using default ringtone');
    }
    
    ringtone.play().catch(e => {
        console.log('Ringtone play failed:', e);
    });
}

// Add user interaction detection
document.addEventListener('click', () => {
    window.userInteracted = true;
}, { once: true });

function stopRingtone() {
    const ringtone = document.getElementById('callRingtone');
    if (ringtone) {
        ringtone.pause();
        ringtone.currentTime = 0;
    }
}

// Clean up call listeners specifically
function cleanupCallListeners() {
    console.log('🧹 Cleaning up call listeners');
    
    window.callState.unsubscribers.forEach((unsub, index) => {
        if (unsub && typeof unsub === 'function') {
            try {
                unsub();
            } catch (error) {
                console.warn('⚠️ Error unsubscribing listener:', error);
            }
        }
    });
    window.callState.unsubscribers = [];
}

// Clean up call state and resources
function cleanupCallState() {
    console.log('🧹 Cleaning up call state');
    
    // Stop media tracks
    if (window.callState.localStream) {
        window.callState.localStream.getTracks().forEach(track => track.stop());
        window.callState.localStream = null;
    }
    
    // Close peer connection
    if (window.callState.peerConnection) {
        window.callState.peerConnection.close();
        window.callState.peerConnection = null;
    }
    
    // Unsubscribe from Firestore listeners
    cleanupCallListeners();
    
    // Stop timer
    stopCallTimer();
    
    // Stop ringtone
    stopRingtone();
    
    // Reset state
    window.callState.isCaller = false;
    window.callState.isReceivingCall = false;
    window.callState.callType = null;
    window.callState.remoteUserId = null;
    window.callState.callId = null;
    window.callState.callStartTime = null;
    window.callState.isInCall = false;
    window.callState.isMuted = false;
    window.callState.isVideoOff = false;
    window.callState.currentCamera = 'user';
}

// Clean up entire call system
function cleanupCallSystem() {
    console.log('🧹 Cleaning up entire call system');
    cleanupCallState();
    window.callState.currentUser = null;
}

// Enhanced friend list button addition with better error handling
window.addCallButtonsToFriendList = function() {
    console.log('🔧 Adding call buttons to friend list');
    
    const maxAttempts = 5;
    let attempts = 0;
    
    const tryAddButtons = () => {
        attempts++;
        
        // Try multiple selectors for friend items
        const selectors = [
            '.friend-item', 
            '.user-item', 
            '[data-user-id]',
            '.friend-list-item',
            '#friendsList .flex.items-center',
            '.friends-container .flex',
            '#onlineUsers .flex',
            '.online-users .flex'
        ];
        
        let friendItems = [];
        selectors.forEach(selector => {
            try {
                const items = document.querySelectorAll(selector);
                if (items.length > 0) {
                    friendItems = [...friendItems, ...Array.from(items)];
                }
            } catch (error) {
                console.warn('⚠️ Error querying selector:', selector, error);
            }
        });
        
        // Remove duplicates
        friendItems = friendItems.filter((item, index, self) => 
            self.findIndex(i => i === item) === index
        );
        
        console.log(`👥 Found ${friendItems.length} friend items on attempt ${attempts}`);
        
        if (friendItems.length > 0) {
            let buttonsAdded = 0;
            
            friendItems.forEach((item, index) => {
                try {
                    const userId = item.dataset.userId || item.dataset.friendId || item.dataset.uid;
                    const userNameElement = item.querySelector('.friend-name, .user-name, [data-user-name], .username, .name, .text-sm.font-medium');
                    const userName = userNameElement?.textContent?.trim() || 'Friend';
                    
                    if (!userId) {
                        return; // Skip items without user ID
                    }
                    
                    // Check if buttons already exist
                    if (item.querySelector('.call-buttons-container')) {
                        return;
                    }
                    
                    // Create call buttons container
                    const buttonsContainer = document.createElement('div');
                    buttonsContainer.className = 'call-buttons-container flex space-x-2 ml-2';
                    
                    // Voice call button
                    const voiceCallBtn = document.createElement('button');
                    voiceCallBtn.className = 'voice-call-btn w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition-colors text-sm';
                    voiceCallBtn.innerHTML = '📞';
                    voiceCallBtn.title = 'Voice Call';
                    voiceCallBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('📞 Voice call button clicked for:', userName, userId);
                        window.startVoiceCallWithFriend(userId, userName);
                    };
                    
                    // Video call button
                    const videoCallBtn = document.createElement('button');
                    videoCallBtn.className = 'video-call-btn w-8 h-8 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors text-sm';
                    videoCallBtn.innerHTML = '📹';
                    videoCallBtn.title = 'Video Call';
                    videoCallBtn.onclick = (e) => {
                        e.stopPropagation();
                        e.preventDefault();
                        console.log('📹 Video call button clicked for:', userName, userId);
                        window.startVideoCallWithFriend(userId, userName);
                    };
                    
                    buttonsContainer.appendChild(voiceCallBtn);
                    buttonsContainer.appendChild(videoCallBtn);
                    
                    // Add to friend item with better styling
                    item.style.display = 'flex';
                    item.style.alignItems = 'center';
                    item.style.justifyContent = 'space-between';
                    item.style.position = 'relative';
                    item.appendChild(buttonsContainer);
                    
                    buttonsAdded++;
                    console.log(`✅ Added call buttons to friend ${index + 1}: ${userName}`);
                    
                } catch (error) {
                    console.warn('⚠️ Error adding buttons to friend item:', error);
                }
            });
            
            console.log(`🎉 Successfully added call buttons to ${buttonsAdded} friends`);
            
        } else if (attempts < maxAttempts) {
            console.log(`⏳ No friend items found, retrying in 500ms... (${attempts}/${maxAttempts})`);
            setTimeout(tryAddButtons, 500);
        } else {
            console.log('ℹ️ No friend items found after attempts - this is normal if no friends are online');
        }
    };
    
    tryAddButtons();
};

// Add call buttons to chat header with better error handling
window.addCallButtonsToChat = function() {
    console.log('🔧 Adding call buttons to chat header');
    
    setTimeout(() => {
        try {
            const chatHeaders = document.querySelectorAll('.chat-header, .message-header, [data-chat-user], #chatHeader, .chat-title-bar');
            console.log(`💬 Found ${chatHeaders.length} chat headers`);
            
            chatHeaders.forEach((header, index) => {
                try {
                    const userId = header.dataset.chatUser || header.dataset.userId || header.dataset.recipientId;
                    const userName = header.querySelector('.chat-title, .user-name, .recipient-name, .text-lg.font-semibold')?.textContent?.trim() || 'User';
                    
                    if (!userId) {
                        return; // Skip headers without user ID
                    }
                    
                    // Check if buttons already exist
                    if (header.querySelector('.chat-call-buttons')) {
                        return;
                    }
                    
                    // Create call buttons container
                    const buttonsContainer = document.createElement('div');
                    buttonsContainer.className = 'chat-call-buttons flex space-x-2 ml-4';
                    
                    // Voice call button
                    const voiceCallBtn = document.createElement('button');
                    voiceCallBtn.className = 'chat-voice-call-btn w-10 h-10 bg-green-500 text-white rounded-full flex items-center justify-center hover:bg-green-600 transition-colors';
                    voiceCallBtn.innerHTML = '📞';
                    voiceCallBtn.title = 'Voice Call';
                    voiceCallBtn.onclick = () => {
                        console.log('📞 Chat voice call clicked for:', userName, userId);
                        window.startVoiceCallWithFriend?.(userId, userName);
                    };
                    
                    // Video call button
                    const videoCallBtn = document.createElement('button');
                    videoCallBtn.className = 'chat-video-call-btn w-10 h-10 bg-blue-500 text-white rounded-full flex items-center justify-center hover:bg-blue-600 transition-colors';
                    videoCallBtn.innerHTML = '📹';
                    videoCallBtn.title = 'Video Call';
                    videoCallBtn.onclick = () => {
                        console.log('📹 Chat video call clicked for:', userName, userId);
                        window.startVideoCallWithFriend?.(userId, userName);
                    };
                    
                    buttonsContainer.appendChild(voiceCallBtn);
                    buttonsContainer.appendChild(videoCallBtn);
                    
                    // Add to chat header
                    header.style.display = 'flex';
                    header.style.alignItems = 'center';
                    header.style.justifyContent = 'space-between';
                    header.appendChild(buttonsContainer);
                    
                    console.log(`✅ Added call buttons to chat header ${index + 1}: ${userName}`);
                    
                } catch (error) {
                    console.warn('⚠️ Error adding buttons to chat header:', error);
                }
            });
        } catch (error) {
            console.error('❌ Error in addCallButtonsToChat:', error);
        }
    }, 2000);
};

// Expose friend call functions to window for chat.js integration
window.startVoiceCallWithFriend = function(friendId, friendName) {
    console.log('🎯 Starting voice call with friend:', friendName, friendId);
    window.startCall(friendId, friendName, 'voice');
};

window.startVideoCallWithFriend = function(friendId, friendName) {
    console.log('🎯 Starting video call with friend:', friendName, friendId);
    window.startCall(friendId, friendName, 'video');
};

// Add missing modal functions to prevent errors
window.closeNotifications = function() {
    const modal = document.getElementById('notificationsSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    } else {
        console.log('Notifications modal not found, but this is okay');
    }
};

// Initialize when script loads
console.log('🚀 call.js loaded, waiting for authentication...');

// Auto-initialize if user is already authenticated
if (window.currentUser) {
    console.log('✅ User already authenticated, initializing call system');
    setTimeout(() => {
        window.initializeCallSystem();
    }, 1000);
}

// Export functions for global access
window.showIncomingCallPopup = showIncomingCallPopup;
window.hideIncomingCallPopup = hideIncomingCallPopup;
window.showCallUI = showCallUI;
window.hideCallUI = hideCallUI;
window.startCallTimer = startCallTimer;
window.stopCallTimer = stopCallTimer;
window.playRingtone = playRingtone;
window.stopRingtone = stopRingtone;
window.cleanupCallSystem = cleanupCallSystem;

console.log('✅ call.js initialization complete');