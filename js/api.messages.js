// js/api.messages.js
// ============================================================================
// SHARED IPC MESSAGE-ID UTILITY
// ============================================================================
// NOTE: This file originally also contained the full chat/conversation
// messaging API (sendMessageHTTP, fetchMessages, reactions, conversation
// CRUD, uploadFile, etc.). That messaging module has been deleted.
//
// This file is kept — NOT deleted — because friend-core.bootstrap.js and
// friend-core.ui-bridge.js import generateMessageId() from it. That function
// has nothing to do with chat messages: it's a generic unique-id generator
// used for the internal cross-iframe postMessage/IPC envelope protocol
// (see MessageIdAuthority below), and the friend module depends on it
// independently of chat messaging.
// ============================================================================

class MessageIdAuthority {
    constructor() {
        this.counter = 0;
        this.prefix = 'msg';
        this.instanceId = Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
        this.generatedIds = new Set();
        this.idGenerationCount = 0;
    }

    generate() {
        this.counter = (this.counter + 1) % 1000000;
        this.idGenerationCount++;

        const timestamp = Date.now();
        const counterStr = this.counter.toString(36).padStart(4, '0');
        const instancePart = this.instanceId;
        const randomPart = Math.random().toString(36).substring(2, 6);

        const messageId = `${this.prefix}_${timestamp}_${counterStr}_${instancePart}_${randomPart}`;

        if (this.generatedIds.has(messageId)) {
            return this.generate();
        }

        if (this.generatedIds.size > 10000) {
            const entries = Array.from(this.generatedIds);
            this.generatedIds.clear();
            for (let i = entries.length - 5000; i < entries.length; i++) {
                this.generatedIds.add(entries[i]);
            }
        }

        this.generatedIds.add(messageId);
        return messageId;
    }

    validate(id) {
        if (!id || typeof id !== 'string') return false;
        const pattern = /^msg_\d+_[a-z0-9]+_[a-z0-9]+_[a-z0-9]+$/;
        return pattern.test(id);
    }

    getStats() {
        return {
            totalGenerated: this.idGenerationCount,
            currentCounter: this.counter,
            instanceId: this.instanceId,
            cachedIds: this.generatedIds.size
        };
    }
}

const GlobalMessageIdAuthority = new MessageIdAuthority();

export function generateMessageId() {
    return GlobalMessageIdAuthority.generate();
}

export function validateMessageId(id) {
    return GlobalMessageIdAuthority.validate(id);
}

export function getMessageIdStats() {
    return GlobalMessageIdAuthority.getStats();
}
