// =============================================================================
// js/services.message.js
// -----------------------------------------------------------------------------
// FIX-404/FIX-MISSING-SERVICE: this file previously didn't exist (see the
// removed <script src="js/services.message.js"> 404 in chat.html), yet
// js/app.offline.queue.js and js/app.sync.manager.js both call
// window.services.message.{sendMessage,editMessage,deleteMessage,markAsRead}
// unconditionally when flushing the offline queue — every retried
// send/edit/delete/read-receipt was failing with "Message service
// unavailable" because nothing ever defined window.services.message.
//
// The real implementation (window.MessageModule: sendMessage, editMessage,
// deleteMessage, markRead, ...) lives in js/message-client.js, which is only
// ever loaded inside message.html — the persistent #messagesIframe embedded
// in chat.html (see the <iframe id="messagesIframe" ...> in chat.html) — not
// in chat.html's own window. So this file is a thin adapter: it reaches into
// that iframe's window for the real module instead of re-implementing
// send/encrypt logic here, and it also re-shapes a couple of argument orders
// to match how the offline queue already calls them (see app.offline.queue.js
// and app.sync.manager.js's window.services.message.* call sites).
//
// If the iframe or its module isn't ready yet (e.g. flushing the queue right
// at boot, before messagesIframe has finished loading), each method throws a
// descriptive error rather than silently no-op'ing — app.offline.queue.js's
// existing catch/retry logic already treats a thrown error as "leave this
// item queued, try again next flush", so this fails safe.
// =============================================================================

(function () {
    'use strict';

    function _getModule() {
        var frame = document.getElementById('messagesIframe');
        var win = frame && frame.contentWindow;
        var mod = win && win.MessageModule;
        if (!mod) {
            throw new Error('Message service unavailable (messagesIframe/MessageModule not ready yet)');
        }
        return mod;
    }

    window.services = window.services || {};

    window.services.message = {
        // app.offline.queue.js: window.services.message.sendMessage(item.data)
        // MessageModule.sendMessage({ chatId, receiverId, content, type, replyToId, attachment })
        // — same shape, passed straight through.
        sendMessage: function (data) {
            return _getModule().sendMessage(data);
        },

        // app.offline.queue.js: window.services.message.editMessage(item.data.messageId, item.data.content, item.data.chatId)
        // MessageModule.editMessage(chatId, messageId, content) — different argument order.
        editMessage: function (messageId, content, chatId) {
            return _getModule().editMessage(chatId, messageId, content);
        },

        // app.offline.queue.js: window.services.message.deleteMessage(item.data.messageId, item.data.chatId)
        // MessageModule.deleteMessage(chatId, messageId, opts) — different argument order.
        deleteMessage: function (messageId, chatId) {
            return _getModule().deleteMessage(chatId, messageId);
        },

        // app.offline.queue.js: window.services.message.markAsRead(item.data.chatId, item.data.messageIds)
        // MessageModule.markRead(chatId, messageIds) — same order, different name.
        markAsRead: function (chatId, messageIds) {
            return _getModule().markRead(chatId, messageIds);
        }
    };
})();
