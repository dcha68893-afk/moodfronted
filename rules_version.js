rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // ========== BASIC HELPER FUNCTIONS ==========
    function isAuthenticated() {
      return request.auth != null;
    }
    
    function isUser(userId) {
      return request.auth != null && request.auth.uid == userId;
    }
    
    // Validation functions
    function isValidMood(mood) {
      return mood in ['joy', 'love', 'calm', 'excited', 'sad', 'angry', 'happy', 'creative', 'motivated', 'reflective'];
    }
    
    function isValidAudience(audience) {
      return audience in ['public', 'friends', 'close-friends', 'only-me'];
    }
    
    function isValidStoryType(storyType) {
      return storyType in ['image', 'video', 'text'];
    }
    
    function isValidListing() {
      return request.resource.data.title is string &&
        request.resource.data.title.size() > 0 &&
        request.resource.data.title.size() < 100 &&
        request.resource.data.price is number &&
        request.resource.data.price > 0 &&
        request.resource.data.price < 100000 &&
        request.resource.data.category is string &&
        request.resource.data.status == 'active' &&
        request.resource.data.createdAt is timestamp &&
        request.resource.data.images is list &&
        request.resource.data.images.size() <= 8;
    }

    // ========== CHAT & MESSAGING HELPERS ==========
    function isChatParticipant(chatId) {
      // Use get() to check if the current user is listed in the chat's participants field
      return isAuthenticated() &&
        chatId is string && 
        get(/databases/$(database)/documents/chats/$(chatId)).data.participants.hasAny([request.auth.uid]);
    }
    
    function isGroupMember(groupId) {
      // Use get() to check if the current user is listed in the group's members field
      return isAuthenticated() &&
        groupId is string &&
        get(/databases/$(database)/documents/groups/$(groupId)).data.members.hasAny([request.auth.uid]);
    }
    
    // ========== CORE COLLECTIONS ==========

    // ---------------- USERS ----------------
    match /users/{userId} {
      allow read: if isAuthenticated();
      
      // Fixed creation rules - matches your registration code
      allow create: if isAuthenticated() && isUser(userId) &&
        request.resource.data.uid == request.auth.uid &&
        request.resource.data.email != null &&
        request.resource.data.displayName != null;
      
      allow update: if isAuthenticated() && isUser(userId) &&
        request.resource.data.keys().hasOnly([
          'displayName', 'photoURL', 'bio', 'lastLogin',  
          'interests', 'preferredMoods', 'customColors',
          'updatedAt', 'about', 'mood', 'lastSeen',
          'userName', 'userAvatar', 'coverPhoto', 'status',
          'postsCount', 'followersCount', 'followingCount', 'energy',
          'badges', 'streak', 'points', 'achievements',
          'coverURL', 'phone'
        ]);
      
      allow delete: if isAuthenticated() && isUser(userId);
    }

    // ---------------- FOLLOWERS (Users following this profile: /users/{profileId}/followers/{followerId}) ----------------
    match /users/{userId}/followers/{followerId} {
      // Allow the profile owner (userId) or the follower (followerId) to read the relationship
      allow read: if isAuthenticated() && (isUser(userId) || isUser(followerId));

      // Allow only the authenticated user to follow another (create the relationship)
      allow create: if isAuthenticated() &&
        isUser(followerId) &&
        request.resource.data.followedId == userId &&
        request.resource.data.timestamp is timestamp;

      // Allow only the follower to unfollow (delete the relationship)
      allow delete: if isAuthenticated() && isUser(followerId);
    }

    // ---------------- FOLLOWING (Users this profile is following: /users/{userId}/following/{followedId}) ----------------
    match /users/{userId}/following/{followedId} {
      // Allow the profile owner (userId) to read who they are following
      allow read: if isAuthenticated() && isUser(userId);

      // Allow only the authenticated user to start following someone (create the relationship)
      allow create: if isAuthenticated() &&
        isUser(userId) &&
        request.resource.data.followerId == userId &&
        request.resource.data.timestamp is timestamp;

      // Allow only the user to stop following (delete the relationship)
      allow delete: if isAuthenticated() && isUser(userId);
    }
    
    // ---------------- POSTS ----------------
    match /posts/{postId} {
      allow read: if isAuthenticated() && (
        resource.data.audience == 'public' ||
        resource.data.audience == 'friends' ||
        resource.data.audience == 'close-friends' ||
        resource.data.userId == request.auth.uid
      );
      
      allow create: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.userName != null &&
        request.resource.data.userAvatar != null &&
        request.resource.data.timestamp != null &&
        request.resource.data.audience != null &&
        isValidAudience(request.resource.data.audience) &&
        (request.resource.data.mood == null || isValidMood(request.resource.data.mood)) &&
        request.resource.data.likesCount is number &&
        request.resource.data.commentsCount is number &&
        request.resource.data.sharesCount is number &&
        request.resource.data.viewsCount is number;

      allow update: if isAuthenticated() && (
        resource.data.userId == request.auth.uid
      ) &&
        request.resource.data.keys().hasOnly([
          'likes', 'likesCount', 'commentsCount', 'sharesCount', 'viewsCount',
          'vibeReactions', 'appreciationCount', 'updatedAt'
        ]);

      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ---------------- POST COMMENTS ----------------
    match /posts/{postId}/comments/{commentId} {
      allow read: if isAuthenticated();

      allow create: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.userName != null &&
        request.resource.data.userAvatar != null &&
        request.resource.data.content != null &&
        request.resource.data.timestamp != null;

      allow update: if isAuthenticated() && resource.data.userId == request.auth.uid &&
        request.resource.data.keys().hasOnly(['content', 'updatedAt']);

      allow delete: if isAuthenticated() && (
        resource.data.userId == request.auth.uid ||
        resource.data.userId == request.auth.uid 
      );
    }

    // ---------------- STORIES ----------------
    match /stories/{storyId} {
      allow read: if isAuthenticated() && (
        request.time < resource.data.expiresAt
      );
      
      allow create: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.userName != null &&
        request.resource.data.userAvatar != null &&
        request.resource.data.timestamp != null &&
        request.resource.data.expiresAt != null &&
        request.resource.data.audience != null &&
        isValidAudience(request.resource.data.audience) &&
        isValidStoryType(request.resource.data.mediaType) &&
        (request.resource.data.mediaType != 'text' || request.resource.data.content != null) &&
        (request.resource.data.mediaType == 'text' || request.resource.data.mediaUrl != null) &&
        request.resource.data.viewsCount is number;

      allow update: if isAuthenticated() && resource.data.userId == request.auth.uid &&
        request.resource.data.keys().hasOnly(['views', 'viewsCount', 'updatedAt']);

      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ---------------- REELS ----------------
    match /reels/{reelId} {
      allow read: if isAuthenticated();
      
      allow create: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.userName != null &&
        request.resource.data.userAvatar != null &&
        request.resource.data.videoUrl != null &&
        request.resource.data.duration is number &&
        request.resource.data.duration <= 60 &&
        request.resource.data.timestamp != null &&
        request.resource.data.likesCount is number &&
        request.resource.data.commentsCount is number &&
        request.resource.data.sharesCount is number &&
        request.resource.data.viewsCount is number;

      allow update: if isAuthenticated() && resource.data.userId == request.auth.uid &&
        request.resource.data.keys().hasOnly([
          'likes', 'likesCount', 'commentsCount', 'sharesCount',  
          'viewsCount', 'updatedAt'
        ]);

      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ---------------- REEL COMMENTS ----------------
    match /reels/{reelId}/comments/{commentId} {
      allow read: if isAuthenticated();

      allow create: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.userName != null &&
        request.resource.data.userAvatar != null &&
        request.resource.data.content != null &&
        request.resource.data.timestamp != null;

      allow update: if isAuthenticated() && resource.data.userId == request.auth.uid &&
        request.resource.data.keys().hasOnly(['content', 'updatedAt']);

      allow delete: if isAuthenticated() && (
        resource.data.userId == request.auth.uid
      );
    }

    // ---------------- STATUSES ----------------
    match /statuses/{statusId} {
      allow read: if isAuthenticated() && (
        resource.data.userId == request.auth.uid ||
        request.time < resource.data.expiresAt
      );
      
      allow create: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.timestamp != null &&
        request.resource.data.expiresAt != null &&
        request.resource.data.type in ['emoji', 'text', 'image', 'video', 'audio'] &&
        request.resource.data.content != null &&
        request.resource.data.userDisplayName != null;

      allow update: if false;
      
      allow delete: if isAuthenticated() && 
        resource.data.userId == request.auth.uid;
    }

    // ---------------- FRIENDSHIPS ----------------
    match /friendships/{friendshipId} {
      allow read: if isAuthenticated() && 
        resource.data.users.hasAny([request.auth.uid]);
      
      allow create: if isAuthenticated() &&
        request.resource.data.users != null &&
        request.resource.data.users.hasAny([request.auth.uid]) &&
        request.resource.data.users.size() == 2 &&
        request.resource.data.status == 'pending' &&
        request.resource.data.createdAt != null;
      
      allow update: if isAuthenticated() && 
        resource.data.users.hasAny([request.auth.uid]) &&
        request.resource.data.keys().hasOnly(['status', 'updatedAt']) &&
        request.resource.data.status in ['accepted', 'rejected'];
      
      allow delete: if isAuthenticated() && 
        resource.data.users.hasAny([request.auth.uid]);
    }

    // ========== CHAT & MESSAGING ==========

    // ---------------- CHATS ----------------
    match /chats/{chatId} {
      allow read: if isAuthenticated() &&  
        resource.data.participants.hasAny([request.auth.uid]);

      allow create: if isAuthenticated() &&
        request.resource.data.participants is list &&
        request.resource.data.participants.size() == 2 &&
        request.resource.data.participants.hasAll([request.auth.uid]) && // NOTE: The .hasAll([request.auth.uid]) here seems redundant/incorrect if you intend for 2 different people. A common pattern is to ensure the user is one of the two and that there are two total, but .hasAll is meant for checking if *all* items in the list are present. It should probably be: request.resource.data.participants.hasAny([request.auth.uid])
        request.resource.data.createdAt is timestamp; 

      allow update: if isAuthenticated() &&  
        resource.data.participants.hasAny([request.auth.uid]) && 
        request.resource.data.keys().hasOnly([
          'lastMessage',  
          'lastMessageTime',  
          'typing',
          'lastActivity'
        ]);

      allow delete: if false;
    }

    // ---------------- MESSAGES ----------------
    match /messages/{messageId} {
      allow read: if isChatParticipant(resource.data.chatId);

      allow create: if isAuthenticated() &&
        request.resource.data.senderId == request.auth.uid &&
        isChatParticipant(request.resource.data.chatId) &&
        request.resource.data.timestamp is timestamp &&
        request.resource.data.text is string;

      allow update: if isAuthenticated() &&
        resource.data.senderId == request.auth.uid &&
        isChatParticipant(resource.data.chatId) &&
        request.resource.data.keys().hasOnly(['status', 'reactions']);

      allow delete: if false;
    }

    // ---------------- GROUP_MESSAGES ----------------
    match /group_messages/{messageId} {
      allow read: if isGroupMember(resource.data.groupId);

      allow create: if isAuthenticated() &&
        request.resource.data.senderId == request.auth.uid &&
        isGroupMember(request.resource.data.groupId) &&
        request.resource.data.timestamp is timestamp &&
        request.resource.data.text is string;

      allow update: if isAuthenticated() &&
        resource.data.senderId == request.auth.uid &&
        isGroupMember(resource.data.groupId) &&
        request.resource.data.keys().hasOnly(['status', 'reactions']);

      allow delete: if false;
    }
    
    // ---------------- FCM TOKENS (NEW) ----------------
    match /fcm_tokens/{userId} {
      // Allow user to read and update their own FCM token list (for multi-device support)
      allow read, write: if isUser(userId) && request.resource.data.tokens is list;
      
      // Allow user to create their token list document
      allow create: if isUser(userId);
      
      // Allow user to delete their token list document
      allow delete: if isUser(userId);
    }

    // ========== GROUPS & COMMUNITIES ==========

    // ---------------- GROUPS ----------------
    match /groups/{groupId} {
      allow read: if isAuthenticated() &&  
        resource.data.members.hasAny([request.auth.uid]);

      allow create: if isAuthenticated() &&
        request.resource.data.createdBy == request.auth.uid &&
        request.resource.data.name != null &&
        request.resource.data.members is list &&
        request.resource.data.members.hasAny([request.auth.uid]) &&
        request.resource.data.memberCount is number &&
        request.resource.data.createdAt != null;

      allow update: if isAuthenticated() &&  
        resource.data.members.hasAny([request.auth.uid]) && 
        request.resource.data.keys().hasOnly([
          'name', 'description', 'avatar', 'members', 'memberCount',
          'lastActivity', 'updatedAt'
        ]);

      allow delete: if isAuthenticated() && resource.data.createdBy == request.auth.uid;
    }

    // ---------------- SPACES ----------------
    match /spaces/{spaceId} {
      allow read: if isAuthenticated() &&  
        resource.data.members.hasAny([request.auth.uid]);

      allow create: if isAuthenticated() &&
        request.resource.data.createdBy == request.auth.uid &&
        request.resource.data.name != null &&
        request.resource.data.members is list &&
        request.resource.data.members.hasAny([request.auth.uid]) &&
        request.resource.data.memberCount is number &&
        request.resource.data.createdAt != null;

      allow update: if isAuthenticated() &&  
        resource.data.members.hasAny([request.auth.uid]) && 
        request.resource.data.keys().hasOnly([
          'name', 'description', 'avatar', 'members', 'memberCount',
          'lastActivity', 'updatedAt'
        ]);

      allow delete: if isAuthenticated() && resource.data.createdBy == request.auth.uid;
    }

    // ---------------- EVENTS ----------------
    match /events/{eventId} {
      allow read: if isAuthenticated();

      allow create: if isAuthenticated() &&
        request.resource.data.createdBy == request.auth.uid &&
        request.resource.data.name != null &&
        request.resource.data.date != null &&
        request.resource.data.description != null &&
        request.resource.data.attendees is list &&
        request.resource.data.attendeeCount is number &&
        request.resource.data.createdAt != null;

      allow update: if isAuthenticated() && (
        resource.data.createdBy == request.auth.uid ||
        resource.data.attendees.hasAny([request.auth.uid])
      ) &&
        request.resource.data.keys().hasOnly([
          'name', 'description', 'location', 'date', 'attendees',
          'attendeeCount', 'updatedAt'
        ]);

      allow delete: if isAuthenticated() && resource.data.createdBy == request.auth.uid;
    }

    // ========== FILE UPLOADS ==========

    // ---------------- FILE METADATA ----------------
    match /file_metadata/{fileId} {
      // User can read metadata for files they own or files marked as public
      allow read: if isAuthenticated() && (
        resource.data.userId == request.auth.uid ||
        resource.data.isPublic == true
      );
      
      // User can create metadata entry upon upload to Cloudinary/Storage
      allow create: if isAuthenticated() && 
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.fileUrl is string &&
        request.resource.data.fileName is string &&
        request.resource.data.uploadedAt is timestamp;
      
      // User can only delete the file metadata for files they own
      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
      
      // Prevent updates (metadata should be immutable once created, except for simple flags)
      allow update: if false; 
    }

    // ========== GAMING & LEADERBOARDS ==========

    // ---------------- GAMES (Listings) ----------------
    match /games/{gameId} {
      // Allow all authenticated users to read the list of available games
      allow read: if isAuthenticated();
      // Only project admins should be able to manage game listings
      allow create, update, delete: if false; 
    }

    // ---------------- USER GAME STATS ----------------
    match /user_game_stats/{userId} {
      // Only the user can read and write their own game stats, high scores, etc.
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- GAME LEADERBOARDS ----------------
    match /game_leaderboards/{leaderboardId} {
      // Allow all authenticated users to read the leaderboards
      allow read: if isAuthenticated();
      // No user should be able to write directly to the main leaderboard collection
      allow create, update, delete: if false; 
    }
    
    // ---------------- GAME TRANSACTIONS ----------------
    match /game_transactions/{transactionId} {
      // Allow read if the user is the buyer
      allow read: if isAuthenticated() && resource.data.userId == request.auth.uid;
      // Allow creation for purchasing game items/currency
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      allow update, delete: if false;
    }

    // ========== MARKETPLACE ==========

    // ---------------- LISTINGS ----------------
    match /listings/{listingId} {
      allow read: if true;
      allow create: if isAuthenticated() &&  
        request.auth.uid == request.resource.data.sellerId &&
        isValidListing();
      allow update, delete: if isAuthenticated() &&  
        request.auth.uid == resource.data.sellerId;
    }

    // ---------------- FAVORITES (Marketplace) ----------------
    match /favorites/{favoriteId} {
      allow read, write: if isAuthenticated() &&  
        request.auth.uid == resource.data.userId;
      allow create: if isAuthenticated() &&  
        request.auth.uid == request.resource.data.userId;
    }

    // ---------------- RECENTLY VIEWED ----------------
    match /recentlyViewed/{viewId} {
      allow read, write: if isAuthenticated() &&  
        request.auth.uid == resource.data.userId;
      allow create: if isAuthenticated() &&  
        request.auth.uid == request.resource.data.userId;
    }

    // ---------------- CART ----------------
    match /cart/{cartItemId} {
      allow read, write: if isAuthenticated() &&  
        request.auth.uid == resource.data.userId;
      allow create: if isAuthenticated() &&  
        request.auth.uid == request.resource.data.userId;
    }

    // ---------------- TRANSACTIONS (Marketplace) ----------------
    match /transactions/{transactionId} {
      allow read, write: if isAuthenticated() &&  
        (request.auth.uid == resource.data.buyerId ||  
          request.auth.uid == resource.data.sellerId);
      allow create: if isAuthenticated();
    }

    // ========== PAYMENT & SUBSCRIPTIONS ==========

    // ---------------- USER WALLET/BALANCE ----------------
    match /wallets/{userId} {
      allow read, update: if isAuthenticated() && isUser(userId) &&
        // Only allow updating via server logic (Cloud Functions)
        request.resource.data.keys().hasOnly(['balance', 'updatedAt', 'lastTransactionId']); 

      allow create, delete: if false;
    }
    
    // ---------------- USER PAYMENT METHODS ----------------
    match /payment_methods/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }
    
    // ---------------- SUBSCRIPTIONS ----------------
    match /subscriptions/{userId} {
      allow read: if isAuthenticated() && isUser(userId);
      // Managed by server/webhooks
      allow create, update, delete: if false; 
    }

    // ========== USER DATA & SETTINGS ==========

    // ---------------- SAVED POSTS ----------------
    match /users/{userId}/savedPosts/{savedPostId} {
      allow read: if isAuthenticated() && isUser(userId);

      allow create: if isAuthenticated() && isUser(userId) &&
        request.resource.data.postId != null &&
        request.resource.data.savedAt != null;

      allow update: if false;

      allow delete: if isAuthenticated() && isUser(userId);
    }

    // ---------------- USER SETTINGS ----------------
    match /user_settings/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- PRIVACY SETTINGS ----------------
    match /privacy_settings/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- SECURITY SETTINGS ----------------
    match /security_settings/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- USER BLOCKLIST ----------------
    match /user_blocklist/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- USER ACTIVITY ----------------
    match /user_activity/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- USER MOODS ----------------
    match /user_moods/{userId} {
      allow read: if isAuthenticated() && isUser(userId);
      allow write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- AI SUGGESTIONS ----------------
    match /ai_suggestions/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- CHAT BACKUPS ----------------
    match /chat_backups/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- STORAGE USAGE ----------------
    match /storage_usage/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ---------------- LABELS ----------------
    match /labels/{userId} {
      allow read, write: if isAuthenticated() && isUser(userId);
    }

    // ========== NOTIFICATIONS & COMMUNICATION ==========

    // ---------------- NOTIFICATIONS ----------------
    match /notifications/{notificationId} {
      allow read: if isAuthenticated() && resource.data.userId == request.auth.uid;

      // Allow client to create their own notifications (e.g., in-app toasts/prompts)
      allow create: if isAuthenticated() &&
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.type != null &&
        request.resource.data.title != null &&
        request.resource.data.message != null &&
        request.resource.data.createdAt != null;

      // Allow client to mark a notification as read
      allow update: if isAuthenticated() && resource.data.userId == request.auth.uid &&
        request.resource.data.keys().hasOnly(['read', 'updatedAt']);

      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ---------------- MESSAGE REACTIONS ----------------
    match /message_reactions/{reactionId} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() &&  
        request.resource.data.userId == request.auth.uid &&
        request.resource.data.messageId != null &&
        request.resource.data.timestamp != null;
      allow update: if isAuthenticated() && resource.data.userId == request.auth.uid;
      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ---------------- CALL HISTORY ----------------
    match /call_history/{callId} {
      allow read: if isAuthenticated() &&  
        resource.data.participants.hasAny([request.auth.uid]);

      allow create: if isAuthenticated() &&
        request.resource.data.participants.hasAny([request.auth.uid]);

      allow update: if false;
      
      allow delete: if isAuthenticated() &&  
        resource.data.participants.hasAny([request.auth.uid]);
    }

    // ========== BUSINESS & ADS ==========

    // ---------------- BUSINESS CATALOGUES ----------------
    match /business_catalogues/{businessId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && isUser(businessId);
    }

    // ---------------- ADVERTISEMENTS ----------------
    match /advertisements/{adId} {
      allow read: if isAuthenticated();
      allow write: if isAuthenticated() && request.resource.data.businessId == request.auth.uid;
    }

    // ========== SYSTEM COLLECTIONS ==========

    // ---------------- FAQ CONTENT ----------------
    match /faq/{docId} {
      allow read: if isAuthenticated();
      // Managed by admin/server
      allow create, update, delete: if false;
    }

    // ---------------- PLATFORM STATS/ANALYTICS ----------------
    match /platform_stats/{docId} {
        allow read: if isAuthenticated();
        // Managed by admin/server
        allow create, update, delete: if false; 
    }
    
    // ---------------- USER API USAGE ----------------
    match /user_api_usage/{userId} {
        allow read: if isAuthenticated() && isUser(userId);
        // Managed by server process that tracks API calls
        allow create, update, delete: if false;
    }
    
    // ---------------- TRENDING TOPICS ----------------
    match /trending/{topicId} {
      allow read: if isAuthenticated();
      // Managed by admin/server
      allow create, update, delete: if false;
    }

    // ---------------- USER BADGES ----------------
    match /user_badges/{userId} {
      allow read: if isAuthenticated() && isUser(userId);
      // Managed by server for game/achievement logic
      allow write: if false;
    }

    // ---------------- FEEDBACK ----------------
    match /feedback/{feedbackId} {
      allow read: if isAuthenticated() && resource.data.userId == request.auth.uid;
      allow create: if isAuthenticated() && request.resource.data.userId == request.auth.uid;
      allow update: if false;
      allow delete: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ---------------- SUPPORT TICKETS ----------------
    match /support_tickets/{ticketId} {
      allow read, write: if isAuthenticated() && resource.data.userId == request.auth.uid;
    }

    // ---------------- INVITE CODES ----------------
    match /invite_codes/{code} {
      allow read: if isAuthenticated();
      allow create: if isAuthenticated() && request.resource.data.createdBy == request.auth.uid;
      allow update: if isAuthenticated() && resource.data.createdBy == request.auth.uid;
      allow delete: if isAuthenticated() && resource.data.createdBy == request.auth.uid;
    }

    // ========== DEFAULT DENY ==========
    match /{document=**} {
      allow read, write: if false;
    }
  } // <-- This brace closes the 'match /databases/{database}/documents' block
} // <-- This brace closes the 'service cloud.firestore' block