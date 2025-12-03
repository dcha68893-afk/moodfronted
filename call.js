// call.js - WebRTC Voice/Video Calling System for Kynecta - Fixed Version
// Requires: Firebase v8 SDK loaded via CDN, chat.js for user data

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
    ringtoneUrl: null,
    audioContext: null,
    ringtoneSource: null,
    isInitialized: false,
    processedCallIds: new Set(), // Track processed calls to prevent duplicates
    incomingCallTimeout: null, // Timeout for auto-rejecting incoming calls
    lastCallEndTime: null, // Track when last call ended
    currentCallDocument: null // Track current call document reference
};

// WebRTC Configuration
const rtcConfig = {
    iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
        { urls: "stun:stun1.l.google.com:19302" }
        // TURN servers removed for simplicity - add your own if needed
    ]
};

// Initialize call system when user is authenticated
window.initializeCallSystem = function() {
    console.log('🔧 Initializing call system...');
    
    if (window.callState.isInitialized) {
        console.log('ℹ️ Call system already initialized');
        return;
    }
    
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
            
            // Clear processed calls history for new session
            window.callState.processedCallIds.clear();
            
            // Setup event listeners FIRST
            setupCallEventListeners();
            
            // Then load other components
            loadUserPreferences();
            listenForIncomingCalls();
            
            // Add buttons to DOM elements (with retry mechanism)
            setTimeout(() => addCallButtonsToFriendList(), 1000);
            setTimeout(() => addCallButtonsToChat(), 2000);
            
            // Clean up any old calls for this user
            cleanupOldCalls(user.uid);
            
            window.callState.isInitialized = true;
            
        } else {
            console.log('❌ User not authenticated, cleaning up call system');
            cleanupCallSystem();
        }
    });
};

// Setup all event listeners
function setupCallEventListeners() {
    console.log('🔧 Setting up call event listeners');
    
    // Remove any existing listeners first
    document.removeEventListener('click', handleCallButtonClicks);
    
    // Add main click handler for ALL call buttons
    document.addEventListener('click', handleCallButtonClicks);
    
    // Setup user interaction detection for audio
    document.addEventListener('click', () => {
        window.userInteracted = true;
        if (window.callState.audioContext && window.callState.audioContext.state === 'suspended') {
            window.callState.audioContext.resume();
        }
    }, { once: true });
    
    // Handle page visibility changes
    document.addEventListener('visibilitychange', handleVisibilityChange);
    
    console.log('✅ Call event listeners setup complete');
}

// Handle page visibility changes
function handleVisibilityChange() {
    if (document.hidden) {
        console.log('📱 Page hidden, pausing media if not in call');
        if (!window.callState.isInCall && !window.callState.isReceivingCall) {
            stopRingtone();
        }
    } else {
        console.log('📱 Page visible again');
        // Refresh call listeners when user comes back
        if (window.callState.currentUser && !window.callState.isInCall) {
            listenForIncomingCalls();
        }
    }
}

// Main click handler for ALL call-related buttons
function handleCallButtonClicks(e) {
    // Prevent handling if already in a call
    if (window.callState.isInCall && !e.target.closest('#endCallBtn') && !e.target.closest('.end-call-btn')) {
        console.log('⚠️ Already in a call, ignoring other call buttons');
        return;
    }
    
    // 1. Friend list voice call buttons
    if (e.target.closest('.voice-call-btn') || e.target.closest('.chat-voice-call-btn')) {
        console.log('🎤 Voice call button clicked');
        e.stopPropagation();
        e.preventDefault();
        
        handleFriendCallButtonClick(e, 'voice');
        return;
    }
    
    // 2. Friend list video call buttons
    if (e.target.closest('.video-call-btn') || e.target.closest('.chat-video-call-btn')) {
        console.log('📹 Video call button clicked');
        e.stopPropagation();
        e.preventDefault();
        
        handleFriendCallButtonClick(e, 'video');
        return;
    }
    
    // 3. Accept call button (incoming call popup)
    if (e.target.closest('#acceptCallBtn') || e.target.closest('.accept-call-btn')) {
        console.log('✅ Accept call button clicked');
        e.preventDefault();
        
        if (window.callState.isReceivingCall && window.callState.callId && window.callState.remoteUserId) {
            acceptCall(window.callState.callId, window.callState.remoteUserId, window.callState.callType);
        } else {
            console.warn('Cannot accept call: missing call state');
            showToast('Cannot accept call', 'error');
        }
        return;
    }
    
    // 4. Reject call button (incoming call popup)
    if (e.target.closest('#rejectCallBtn') || e.target.closest('.reject-call-btn')) {
        console.log('❌ Reject call button clicked');
        e.preventDefault();
        
        if (window.callState.callId) {
            rejectCall(window.callState.callId);
        } else {
            hideIncomingCallPopup();
            cleanupCallState();
            showToast('Call rejected', 'info');
        }
        return;
    }
    
    // 5. End call button (active call UI)
    if (e.target.closest('#endCallBtn') || e.target.closest('.end-call-btn')) {
        console.log('📞 End call button clicked');
        e.preventDefault();
        endCall();
        return;
    }
    
    // 6. Toggle microphone button
    if (e.target.closest('#toggleMicBtn') || e.target.closest('.toggle-mic-btn')) {
        console.log('🎤 Toggle mic button clicked');
        e.preventDefault();
        toggleMic();
        return;
    }
    
    // 7. Toggle camera button
    if (e.target.closest('#toggleCameraBtn') || e.target.closest('.toggle-camera-btn')) {
        console.log('📷 Toggle camera button clicked');
        e.preventDefault();
        toggleCamera();
        return;
    }
    
    // 8. Switch camera button
    if (e.target.closest('#switchCameraBtn') || e.target.closest('.switch-camera-btn')) {
        console.log('🔄 Switch camera button clicked');
        e.preventDefault();
        switchCamera();
        return;
    }
}

// Handle friend call button clicks
function handleFriendCallButtonClick(e, callType) {
    const button = e.target.closest('.voice-call-btn, .video-call-btn, .chat-voice-call-btn, .chat-video-call-btn');
    
    if (!button) return;
    
    // Prevent if already in a call
    if (window.callState.isInCall) {
        showToast('You are already in a call', 'warning');
        return;
    }
    
    // Find the friend/user item container
    const containers = [
        button.closest('.friend-item'),
        button.closest('.user-item'),
        button.closest('[data-user-id]'),
        button.closest('[data-friend-id]'),
        button.closest('[data-uid]'),
        button.closest('.chat-header'),
        button.closest('.message-header')
    ];
    
    const container = containers.find(c => c !== null);
    
    if (!container) {
        console.error('Could not find friend container for button:', button);
        showToast('Could not find user information', 'error');
        return;
    }
    
    // Extract user information
    const userId = container.dataset.userId || container.dataset.friendId || container.dataset.uid || 
                   container.dataset.chatUser || container.dataset.recipientId || button.dataset.userId;
    
    // Try multiple selectors for user name
    const nameSelectors = [
        '.friend-name',
        '.user-name',
        '.chat-title',
        '.recipient-name',
        '.username',
        '.name',
        '.text-lg.font-semibold',
        '.text-sm.font-medium',
        'span:first-child'
    ];
    
    let userName = 'Friend';
    for (const selector of nameSelectors) {
        const nameElement = container.querySelector(selector);
        if (nameElement && nameElement.textContent && nameElement.textContent.trim()) {
            userName = nameElement.textContent.trim();
            break;
        }
    }
    
    if (!userId) {
        console.error('No user ID found for call button');
        showToast('Cannot start call: missing user ID', 'error');
        return;
    }
    
    // Prevent calling yourself
    if (window.callState.currentUser && userId === window.callState.currentUser.uid) {
        showToast('You cannot call yourself', 'warning');
        return;
    }
    
    console.log(`📞 Starting ${callType} call with:`, userName, userId);
    window.startCall(userId, userName, callType);
}

// Clean up old calls from Firestore
async function cleanupOldCalls(userId) {
    try {
        console.log('🧹 Cleaning up old calls for user:', userId);
        
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        
        const callsSnapshot = await firebase.firestore().collection('calls')
            .where('createdAt', '>', oneHourAgo)
            .where('status', 'in', ['ringing', 'answered'])
            .get();
            
        const cleanupPromises = [];
        
        callsSnapshot.forEach((doc) => {
            const callData = doc.data();
            const callAge = Date.now() - (callData.createdAt?.toDate?.()?.getTime() || Date.now());
            
            // Mark as missed if ringing for more than 30 seconds
            if (callAge > 30 * 1000 && callData.status === 'ringing') {
                cleanupPromises.push(
                    firebase.firestore().collection('calls').doc(doc.id).update({
                        status: 'missed',
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
                    })
                );
            }
            // End calls that are too old
            else if (callAge > 5 * 60 * 1000) {
                cleanupPromises.push(
                    firebase.firestore().collection('calls').doc(doc.id).update({
                        status: 'ended',
                        reason: 'timeout',
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
        if (!url || typeof url !== 'string') {
            throw new Error('Invalid ringtone URL');
        }
        
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
    
    // Prevent calling yourself
    if (window.callState.currentUser && friendId === window.callState.currentUser.uid) {
        showToast('You cannot call yourself', 'warning');
        return;
    }
    
    // Validate parameters
    if (!friendId || !friendName) {
        console.error('❌ Missing friendId or friendName');
        showToast('Cannot start call: missing contact information', 'error');
        return;
    }
    
    if (!window.callState.currentUser) {
        console.error('❌ User not authenticated');
        showToast('Please log in to make calls', 'error');
        return;
    }
    
    // Check if we have a recent call end (prevent rapid calling)
    if (window.callState.lastCallEndTime && Date.now() - window.callState.lastCallEndTime < 2000) {
        console.log('⏳ Too soon after previous call, waiting...');
        setTimeout(() => window.startCall(friendId, friendName, callType), 2000);
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
        const callDocRef = firebase.firestore().collection('calls').doc(callId);
        window.callState.currentCallDocument = callDocRef;
        
        await callDocRef.set({
            callId: callId,
            callerId: window.callState.currentUser.uid,
            callerName: window.currentUserData?.displayName || window.callState.currentUser.displayName || 'Unknown User',
            receiverId: friendId,
            callType: callType,
            status: 'ringing',
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            callerCandidates: [],
            receiverCandidates: [],
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        console.log('✅ Call document created in Firestore');
        
        // Get local media stream
        await getLocalMediaStream(callType);
        
        // Create peer connection
        await createPeerConnection();
        
        // Create and send offer
        await createAndSendOffer(callId);
        
        // Show call UI
        showCallUI(friendName, callType, 'calling');
        
        // Start ringtone for outgoing call
        playRingtone();
        
        // Set timeout to end call if no answer
        setTimeout(() => {
            if (window.callState.isInCall && window.callState.isCaller) {
                console.log('⏰ Call timeout - no answer');
                endCall();
                showToast('No answer', 'info');
            }
        }, 45000); // 45 seconds timeout
        
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
                frameRate: { ideal: 30 },
                facingMode: 'user'
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
        
        // Handle signaling state
        window.callState.peerConnection.onsignalingstatechange = () => {
            console.log('📶 Signaling state:', window.callState.peerConnection.signalingState);
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
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
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
                
                // Update processed call IDs to prevent duplicates
                if (!window.callState.processedCallIds.has(callId)) {
                    window.callState.processedCallIds.add(callId);
                }
                
                if (callData.answer && window.callState.isCaller && !window.callState.peerConnection.remoteDescription) {
                    console.log('✅ Answer received');
                    handleAnswer(callData.answer);
                }
                
                if (callData.status === 'rejected' || callData.status === 'ended' || callData.status === 'missed') {
                    console.log('📞 Call ended by remote party:', callData.status);
                    endCall();
                    
                    if (callData.status === 'rejected') {
                        showToast('Call rejected', 'info');
                    } else if (callData.status === 'missed') {
                        showToast('Call missed', 'info');
                    }
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
        if (!window.callState.peerConnection.remoteDescription) {
            await window.callState.peerConnection.setRemoteDescription(answer);
            console.log('✅ Remote description set from answer');
            stopRingtone();
            startCallTimer();
            updateCallStatus('connected');
            
            // Update call status to answered
            if (window.callState.callId) {
                await firebase.firestore().collection('calls').doc(window.callState.callId).update({
                    status: 'answered',
                    connectedAt: firebase.firestore.FieldValue.serverTimestamp(),
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
            }
        }
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
            [field]: firebase.firestore.FieldValue.arrayUnion(candidateData),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
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

// Listen for incoming calls
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
                if (change.type === 'added' || change.type === 'modified') {
                    const callData = change.doc.data();
                    const callId = callData.callId;
                    
                    // Skip if already processed
                    if (window.callState.processedCallIds.has(callId)) {
                        return;
                    }
                    
                    const callAge = Date.now() - (callData.createdAt?.toDate?.()?.getTime() || Date.now());
                    
                    // Skip old calls
                    if (callAge > 45 * 1000) {
                        console.log('⏰ Skipping old call:', callId);
                        markCallAsMissed(callId);
                        window.callState.processedCallIds.add(callId);
                        return;
                    }
                    
                    console.log('📞 Incoming call from:', callData.callerName, 'Status:', callData.status, 'Age:', callAge + 'ms');
                    
                    if (callData.status === 'ringing' && !window.callState.isInCall) {
                        // Mark as processed immediately to prevent duplicates
                        window.callState.processedCallIds.add(callId);
                        showIncomingCallPopup(callData.callerName, callData.callType, callId, callData.callerId);
                    }
                    
                    // Auto-reject if call has been ringing too long
                    if (callData.status === 'ringing' && callAge > 30 * 1000) {
                        console.log('⏰ Auto-rejecting old ringing call');
                        markCallAsMissed(callId);
                        window.callState.processedCallIds.add(callId);
                    }
                }
            });
        }, (error) => {
            console.error('❌ Error in incoming calls listener:', error);
        });
    
    window.callState.unsubscribers.push(incomingCallsUnsub);
};

// Mark call as missed
async function markCallAsMissed(callId) {
    try {
        await firebase.firestore().collection('calls').doc(callId).update({
            status: 'missed',
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
    } catch (error) {
        console.error('❌ Error marking call as missed:', error);
    }
}

// Show incoming call popup
function showIncomingCallPopup(callerName, callType, callId, callerId) {
    console.log('🪟 Showing incoming call popup');
    
    // Clear any existing timeout
    if (window.callState.incomingCallTimeout) {
        clearTimeout(window.callState.incomingCallTimeout);
    }
    
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
    
    // Auto-reject after 30 seconds
    window.callState.incomingCallTimeout = setTimeout(() => {
        if (window.callState.isReceivingCall) {
            console.log('⏰ Auto-rejecting incoming call after timeout');
            rejectCall(callId);
        }
    }, 30000);
}

// Hide incoming call popup
function hideIncomingCallPopup() {
    console.log('🪟 Hiding incoming call popup');
    
    // Clear timeout
    if (window.callState.incomingCallTimeout) {
        clearTimeout(window.callState.incomingCallTimeout);
        window.callState.incomingCallTimeout = null;
    }
    
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
    
    // Prevent accepting if already in a call
    if (window.callState.isInCall) {
        console.warn('⚠️ Already in a call');
        showToast('You are already in a call', 'warning');
        return;
    }
    
    try {
        window.callState.isCaller = false;
        window.callState.remoteUserId = callerId;
        window.callState.callId = callId;
        window.callState.callType = callType;
        window.callState.isInCall = true;
        
        // Mark as processed
        window.callState.processedCallIds.add(callId);
        
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
                    lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
                });
                
                console.log('✅ Answer sent');
                
                // Set up listeners for ICE candidates
                setupAnswerListeners(callId);
                
                // Show call UI
                showCallUI(callData.callerName, callType, 'connected');
                startCallTimer();
                
                // Update call document
                await firebase.firestore().collection('calls').doc(callId).update({
                    connectedAt: firebase.firestore.FieldValue.serverTimestamp()
                });
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
                
                if (callData.status === 'ended' || callData.status === 'rejected') {
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
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        });
        
        hideIncomingCallPopup();
        cleanupCallState();
        showToast('Call rejected', 'info');
        
    } catch (error) {
        console.error('❌ Error rejecting call:', error);
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
        const endData = {
            status: 'ended',
            endedBy: window.callState.currentUser?.uid || 'unknown',
            endedAt: firebase.firestore.FieldValue.serverTimestamp(),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
        };
        
        // Add duration if call was connected
        if (window.callState.callStartTime) {
            endData.duration = Date.now() - window.callState.callStartTime;
        }
        
        await firebase.firestore().collection('calls').doc(callId).update(endData);
        
    } catch (error) {
        console.error('❌ Error updating call end status:', error);
    }
    
    // Set last call end time
    window.callState.lastCallEndTime = Date.now();
    
    hideCallUI();
    cleanupCallState();
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
            toggleMicBtn.classList.toggle('bg-red-500', window.callState.isMuted);
            toggleMicBtn.classList.toggle('bg-green-500', !window.callState.isMuted);
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
            toggleCameraBtn.classList.toggle('bg-red-500', window.callState.isVideoOff);
            toggleCameraBtn.classList.toggle('bg-blue-500', !window.callState.isVideoOff);
            
            // Update local video display
            const localVideo = document.getElementById('localVideo');
            if (localVideo) {
                if (window.callState.isVideoOff) {
                    localVideo.style.opacity = '0.5';
                } else {
                    localVideo.style.opacity = '1';
                }
            }
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
            window.callState.localStream.getVideoTracks().forEach(track => track.stop());
            window.callState.localStream.addTrack(newVideoTrack);
            localVideo.srcObject = window.callState.localStream;
            localVideo.play().catch(e => console.warn('Local video play error:', e));
        }
        
        // Stop the audio tracks from the new stream
        newStream.getAudioTracks().forEach(track => track.stop());
        
        console.log('📷 Switched camera to:', newFacingMode);
        showToast('Camera switched', 'success');
        
    } catch (error) {
        console.error('❌ Error switching camera:', error);
        showToast('Failed to switch camera', 'error');
    }
};

// Show call UI with status
function showCallUI(recipientName, callType, status = 'calling') {
    console.log('🖥️ Showing call UI for:', recipientName, 'Status:', status);
    
    const callContainer = document.getElementById('callContainer');
    const callStatus = document.getElementById('callStatus');
    const remoteVideo = document.getElementById('remoteVideo');
    const localVideo = document.getElementById('localVideo');
    const callTimer = document.getElementById('callTimer');
    
    if (callContainer) {
        callContainer.style.display = 'flex';
        callContainer.style.zIndex = '10000';
    }
    
    if (callStatus) {
        if (status === 'calling') {
            callStatus.textContent = `Calling ${recipientName}...`;
        } else if (status === 'connected') {
            callStatus.textContent = `Connected with ${recipientName}`;
        } else {
            callStatus.textContent = `Call with ${recipientName}`;
        }
    }
    
    if (callTimer) {
        callTimer.textContent = '00:00';
        callTimer.style.display = status === 'connected' ? 'block' : 'none';
    }
    
    if (callType === 'video') {
        if (remoteVideo) {
            remoteVideo.style.display = 'block';
            remoteVideo.style.backgroundColor = '#000';
        }
        if (localVideo) {
            localVideo.style.display = 'block';
            localVideo.style.position = 'absolute';
            localVideo.style.bottom = '20px';
            localVideo.style.right = '20px';
            localVideo.style.width = '120px';
            localVideo.style.height = '90px';
            localVideo.style.borderRadius = '8px';
            localVideo.style.border = '2px solid white';
            localVideo.style.boxShadow = '0 2px 10px rgba(0,0,0,0.3)';
        }
    } else {
        if (remoteVideo) remoteVideo.style.display = 'none';
        if (localVideo) localVideo.style.display = 'none';
    }
    
    // Update call controls based on call type
    const toggleCameraBtn = document.getElementById('toggleCameraBtn');
    const switchCameraBtn = document.getElementById('switchCameraBtn');
    
    if (toggleCameraBtn) {
        toggleCameraBtn.style.display = callType === 'video' ? 'flex' : 'none';
    }
    
    if (switchCameraBtn) {
        switchCameraBtn.style.display = callType === 'video' ? 'flex' : 'none';
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
            'new': 'Starting call...',
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
    stopCallTimer();
    
    const callTimer = document.getElementById('callTimer');
    if (!callTimer) return;
    
    callTimer.style.display = 'block';
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
        callTimer.style.display = 'none';
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
        ringtone.volume = 0.5;
        document.body.appendChild(ringtone);
    }
    
    // Stop any existing ringtone first
    ringtone.pause();
    ringtone.currentTime = 0;
    
    // Use custom ringtone if available, otherwise fallback
    if (window.callState.ringtoneUrl) {
        ringtone.src = window.callState.ringtoneUrl;
        console.log('🔔 Using custom ringtone:', window.callState.ringtoneUrl);
    } else {
        // Use default ringtone
        ringtone.src = 'data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2/LDciUFLIHO8tiJNwgZaLvt559NEAxQp+PwtmMcBjiR1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmUgBjiN1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmUgBjiN1/LMeSwFJHfH8N2QQAoUXrTp66hVFApGn+DyvmUgBjiN1/LMeSw=';
        console.log('🔔 Using default ringtone');
    }
    
    ringtone.play().catch(e => {
        console.log('Ringtone play failed:', e.message);
        // Try again with user interaction
        window.userInteracted = true;
    });
}

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
    
    // Stop any incoming call timeout
    if (window.callState.incomingCallTimeout) {
        clearTimeout(window.callState.incomingCallTimeout);
        window.callState.incomingCallTimeout = null;
    }
    
    if (window.callState.localStream) {
        window.callState.localStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        window.callState.localStream = null;
    }
    
    if (window.callState.remoteStream) {
        window.callState.remoteStream.getTracks().forEach(track => {
            track.stop();
            track.enabled = false;
        });
        window.callState.remoteStream = null;
    }
    
    if (window.callState.peerConnection) {
        try {
            window.callState.peerConnection.getSenders().forEach(sender => {
                if (sender.track) {
                    sender.track.stop();
                }
            });
            window.callState.peerConnection.close();
        } catch (error) {
            console.warn('⚠️ Error closing peer connection:', error);
        }
        window.callState.peerConnection = null;
    }
    
    cleanupCallListeners();
    stopCallTimer();
    stopRingtone();
    
    // Clear video elements
    const localVideo = document.getElementById('localVideo');
    const remoteVideo = document.getElementById('remoteVideo');
    
    if (localVideo) {
        localVideo.srcObject = null;
        localVideo.style.opacity = '1';
    }
    
    if (remoteVideo) {
        remoteVideo.srcObject = null;
    }
    
    // Reset state (keep processedCallIds and lastCallEndTime)
    const processedCallIds = window.callState.processedCallIds;
    const lastCallEndTime = window.callState.lastCallEndTime;
    
    Object.assign(window.callState, {
        isCaller: false,
        isReceivingCall: false,
        callType: null,
        remoteUserId: null,
        callId: null,
        callStartTime: null,
        timerInterval: null,
        unsubscribers: [],
        localStream: null,
        remoteStream: null,
        peerConnection: null,
        isMuted: false,
        isVideoOff: false,
        isInCall: false,
        currentCamera: 'user',
        incomingCallTimeout: null,
        currentCallDocument: null,
        processedCallIds: processedCallIds,
        lastCallEndTime: lastCallEndTime
    });
}

// Clean up entire call system
function cleanupCallSystem() {
    console.log('🧹 Cleaning up entire call system');
    cleanupCallState();
    window.callState.currentUser = null;
    window.callState.isInitialized = false;
    window.callState.processedCallIds.clear();
    window.callState.lastCallEndTime = null;
}

// Enhanced friend list button addition
window.addCallButtonsToFriendList = function() {
    console.log('🔧 Adding call buttons to friend list');
    
    const maxAttempts = 10;
    let attempts = 0;
    
    const tryAddButtons = () => {
        attempts++;
        
        // Try multiple selectors for friend items
        const selectors = [
            '.friend-item', 
            '.user-item', 
            '[data-user-id]',
            '[data-friend-id]',
            '[data-uid]',
            '.friend-list-item',
            '#friendsList div[data-user-id]',
            '.friends-container [data-user-id]',
            '#onlineUsers [data-user-id]',
            '.online-users [data-user-id]'
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
                    
                    if (!userId) {
                        console.warn(`No user ID found for item ${index}`);
                        return;
                    }
                    
                    // Skip if it's the current user
                    if (window.callState.currentUser && userId === window.callState.currentUser.uid) {
                        return;
                    }
                    
                    // Check if buttons already exist
                    if (item.querySelector('.call-buttons-container')) {
                        return;
                    }
                    
                    // Get user name
                    let userName = 'Friend';
                    const nameSelectors = [
                        '.friend-name',
                        '.user-name',
                        '.username',
                        '.name',
                        '.text-sm.font-medium',
                        'span:first-child'
                    ];
                    
                    for (const selector of nameSelectors) {
                        const nameEl = item.querySelector(selector);
                        if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
                            userName = nameEl.textContent.trim();
                            break;
                        }
                    }
                    
                    // Ensure user ID is set on the element
                    if (!item.dataset.userId) {
                        item.dataset.userId = userId;
                    }
                    
                    // Create call buttons container
                    const buttonsContainer = document.createElement('div');
                    buttonsContainer.className = 'call-buttons-container flex space-x-2 ml-auto';
                    
                    // Voice call button
                    const voiceCallBtn = document.createElement('button');
                    voiceCallBtn.className = 'voice-call-btn w-8 h-8 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer';
                    voiceCallBtn.innerHTML = '📞';
                    voiceCallBtn.title = `Voice call ${userName}`;
                    voiceCallBtn.dataset.userId = userId;
                    voiceCallBtn.dataset.userName = userName;
                    
                    // Video call button
                    const videoCallBtn = document.createElement('button');
                    videoCallBtn.className = 'video-call-btn w-8 h-8 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer';
                    videoCallBtn.innerHTML = '📹';
                    videoCallBtn.title = `Video call ${userName}`;
                    videoCallBtn.dataset.userId = userId;
                    videoCallBtn.dataset.userName = userName;
                    
                    buttonsContainer.appendChild(voiceCallBtn);
                    buttonsContainer.appendChild(videoCallBtn);
                    
                    // Add to friend item
                    item.style.display = 'flex';
                    item.style.alignItems = 'center';
                    item.style.justifyContent = 'space-between';
                    item.appendChild(buttonsContainer);
                    
                    buttonsAdded++;
                    console.log(`✅ Added call buttons to: ${userName} (${userId})`);
                    
                } catch (error) {
                    console.warn('⚠️ Error adding buttons to friend item:', error);
                }
            });
            
            console.log(`🎉 Successfully added call buttons to ${buttonsAdded} friends`);
            
        } else if (attempts < maxAttempts) {
            console.log(`⏳ No friend items found, retrying in 500ms... (${attempts}/${maxAttempts})`);
            setTimeout(tryAddButtons, 500);
        } else {
            console.log('ℹ️ No friend items found after attempts');
        }
    };
    
    tryAddButtons();
};

// Add call buttons to chat header
window.addCallButtonsToChat = function() {
    console.log('🔧 Adding call buttons to chat header');
    
    const tryAddButtons = () => {
        try {
            const chatHeaders = document.querySelectorAll('.chat-header, .message-header, [data-chat-user], [data-recipient-id], #chatHeader, .chat-title-bar');
            console.log(`💬 Found ${chatHeaders.length} chat headers`);
            
            chatHeaders.forEach((header, index) => {
                try {
                    const userId = header.dataset.chatUser || header.dataset.recipientId || header.dataset.userId;
                    
                    if (!userId) {
                        return;
                    }
                    
                    // Skip if it's the current user
                    if (window.callState.currentUser && userId === window.callState.currentUser.uid) {
                        return;
                    }
                    
                    // Check if buttons already exist
                    if (header.querySelector('.chat-call-buttons')) {
                        return;
                    }
                    
                    // Get user name
                    let userName = 'User';
                    const nameSelectors = [
                        '.chat-title',
                        '.user-name',
                        '.recipient-name',
                        '.text-lg.font-semibold',
                        '.text-xl.font-bold',
                        'h2, h3, h4'
                    ];
                    
                    for (const selector of nameSelectors) {
                        const nameEl = header.querySelector(selector);
                        if (nameEl && nameEl.textContent && nameEl.textContent.trim()) {
                            userName = nameEl.textContent.trim();
                            break;
                        }
                    }
                    
                    // Ensure user ID is set on the element
                    if (!header.dataset.userId) {
                        header.dataset.userId = userId;
                    }
                    
                    // Create call buttons container
                    const buttonsContainer = document.createElement('div');
                    buttonsContainer.className = 'chat-call-buttons flex space-x-2 ml-4';
                    
                    // Voice call button
                    const voiceCallBtn = document.createElement('button');
                    voiceCallBtn.className = 'chat-voice-call-btn w-10 h-10 bg-green-500 hover:bg-green-600 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer';
                    voiceCallBtn.innerHTML = '📞';
                    voiceCallBtn.title = `Voice call ${userName}`;
                    voiceCallBtn.dataset.userId = userId;
                    voiceCallBtn.dataset.userName = userName;
                    
                    // Video call button
                    const videoCallBtn = document.createElement('button');
                    videoCallBtn.className = 'chat-video-call-btn w-10 h-10 bg-blue-500 hover:bg-blue-600 text-white rounded-full flex items-center justify-center transition-colors cursor-pointer';
                    videoCallBtn.innerHTML = '📹';
                    videoCallBtn.title = `Video call ${userName}`;
                    videoCallBtn.dataset.userId = userId;
                    videoCallBtn.dataset.userName = userName;
                    
                    buttonsContainer.appendChild(voiceCallBtn);
                    buttonsContainer.appendChild(videoCallBtn);
                    
                    // Add to chat header
                    header.style.display = 'flex';
                    header.style.alignItems = 'center';
                    header.style.justifyContent = 'space-between';
                    header.appendChild(buttonsContainer);
                    
                    console.log(`✅ Added call buttons to chat header: ${userName} (${userId})`);
                    
                } catch (error) {
                    console.warn('⚠️ Error adding buttons to chat header:', error);
                }
            });
        } catch (error) {
            console.error('❌ Error in addCallButtonsToChat:', error);
        }
    };
    
    // Try immediately, then again after 2 seconds
    tryAddButtons();
    setTimeout(tryAddButtons, 2000);
};

// Expose friend call functions to window
window.startVoiceCallWithFriend = function(friendId, friendName) {
    console.log('🎯 Starting voice call with friend:', friendName, friendId);
    window.startCall(friendId, friendName, 'voice');
};

window.startVideoCallWithFriend = function(friendId, friendName) {
    console.log('🎯 Starting video call with friend:', friendName, friendId);
    window.startCall(friendId, friendName, 'video');
};

// Debug function to test call system
window.debugCallSystem = function() {
    console.log('=== CALL SYSTEM DEBUG INFO ===');
    console.log('Call State:', window.callState);
    console.log('User:', window.callState.currentUser);
    console.log('Is Initialized:', window.callState.isInitialized);
    console.log('Processed Call IDs:', window.callState.processedCallIds.size);
    
    // Check if buttons exist
    const voiceButtons = document.querySelectorAll('.voice-call-btn, .chat-voice-call-btn');
    const videoButtons = document.querySelectorAll('.video-call-btn, .chat-video-call-btn');
    console.log(`Voice call buttons found: ${voiceButtons.length}`);
    console.log(`Video call buttons found: ${videoButtons.length}`);
    
    // Check event listeners
    const allButtons = document.querySelectorAll('button');
    console.log(`Total buttons on page: ${allButtons.length}`);
    
    return {
        callState: window.callState,
        voiceButtons: voiceButtons.length,
        videoButtons: videoButtons.length,
        isInitialized: window.callState.isInitialized
    };
};

// Add missing modal functions to prevent errors
window.closeNotifications = function() {
    const modal = document.getElementById('notificationsSettingsModal');
    if (modal) {
        modal.style.display = 'none';
    }
};

// Helper function for toasts (fallback if not defined)
if (typeof showToast !== 'function') {
    window.showToast = function(message, type = 'info') {
        console.log(`Toast (${type}): ${message}`);
        // Create a simple toast if not already defined
        const toast = document.createElement('div');
        toast.style.cssText = `
            position: fixed;
            top: 20px;
            right: 20px;
            padding: 12px 24px;
            border-radius: 8px;
            color: white;
            font-weight: bold;
            z-index: 10001;
            transition: all 0.3s ease;
        `;
        
        if (type === 'success') {
            toast.style.backgroundColor = '#10B981';
        } else if (type === 'error') {
            toast.style.backgroundColor = '#EF4444';
        } else if (type === 'warning') {
            toast.style.backgroundColor = '#F59E0B';
        } else {
            toast.style.backgroundColor = '#3B82F6';
        }
        
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => {
            toast.style.opacity = '0';
            setTimeout(() => {
                document.body.removeChild(toast);
            }, 300);
        }, 3000);
    };
}

// Initialize when DOM is ready
document.addEventListener('DOMContentLoaded', function() {
    console.log('🚀 call.js loaded, DOM ready');
    
    // Setup event listeners immediately
    setupCallEventListeners();
    
    // Check if user is already authenticated
    if (window.currentUser || (window.firebase && firebase.auth().currentUser)) {
        console.log('✅ User already authenticated, initializing call system');
        setTimeout(() => {
            window.initializeCallSystem();
        }, 1000);
    } else {
        console.log('⏳ Waiting for user authentication...');
    }
});

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
window.cleanupCallState = cleanupCallState;

console.log('✅ call.js initialization complete - Production Ready');