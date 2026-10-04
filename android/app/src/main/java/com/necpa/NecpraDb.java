package com.necpa;

import android.content.Context;

import androidx.annotation.NonNull;
import androidx.room.Dao;
import androidx.room.Database;
import androidx.room.Entity;
import androidx.room.Index;
import androidx.room.Insert;
import androidx.room.OnConflictStrategy;
import androidx.room.PrimaryKey;
import androidx.room.Query;
import androidx.room.Room;
import androidx.room.RoomDatabase;
import androidx.room.Update;

import java.util.List;

/**
 * Native chat store (Phase 2). One Room database holding everything the native Messages screens
 * show: conversations, messages, attachments, reactions, receipts and drafts.
 *
 * Message text is NOT stored in the clear: {@link Msg#body} and {@link Msg#envelope} hold
 * Keystore-sealed strings (the repository seals/opens them), the same protection the native
 * session and ratchet state already get. The whole file is deleted on logout / account switch.
 */
@Database(
        entities = {
                NecpraDb.Conv.class, NecpraDb.Msg.class, NecpraDb.Att.class,
                NecpraDb.React.class, NecpraDb.Receipt.class, NecpraDb.Draft.class
        },
        version = 1,
        exportSchema = false)
public abstract class NecpraDb extends RoomDatabase {

    static final String FILE = "necpra_chat.db";

    // ------------------------------------------------------------------ entities

    @Entity(tableName = "conversations")
    public static class Conv {
        @PrimaryKey public long chatId;
        public String type;          // "direct" | "group"
        public String title;
        public String avatar;
        public long peerId;          // other participant for direct chats, 0 for groups
        public int unread;
        public long lastAt;          // ms epoch, list ordering
        public long lastServerId;    // newest message id the server reported for this chat
        public String lastPreview;   // plain text already safe to show (never ciphertext)
        public long syncCursor;      // highest server id fetched via history/sync (NOT bumped by send acks)
    }

    @Entity(tableName = "messages",
            indices = {
                    @Index(value = {"senderId", "clientMessageId"}, unique = true),
                    @Index(value = {"chatId", "serverId"}),
                    @Index(value = {"chatId", "sortTs"})
            })
    public static class Msg {
        @PrimaryKey(autoGenerate = true) public long localId;
        public long serverId;                 // 0 until the server acknowledged it
        @NonNull public String clientMessageId = "";
        public long chatId;
        public long senderId;
        public boolean mine;
        public String type;
        public String body;                   // sealed plaintext (null = not available, see cryptoState)
        public String envelope;               // sealed ciphertext kept only while the send is unacknowledged
        public int status;                    // NecpraMessageRepository.ST_*
        public int cryptoState;               // NecpraMessageRepository.CS_*
        public long sortTs;
        public long replyToServerId;
        public boolean deleted;
        public boolean edited;
        public int attempts;
        public String lastError;
    }

    @Entity(tableName = "attachments", indices = {@Index("messageLocalId")})
    public static class Att {
        @PrimaryKey(autoGenerate = true) public long id;
        public long messageLocalId;
        public String kind;   // image | video | audio | file
        public String url;
        public String name;
        public String mime;
        public long size;
    }

    @Entity(tableName = "reactions", indices = {@Index(value = {"messageLocalId", "userId"}, unique = true)})
    public static class React {
        @PrimaryKey(autoGenerate = true) public long id;
        public long messageLocalId;
        public long userId;
        public String emoji;
    }

    @Entity(tableName = "receipts", primaryKeys = {"messageLocalId", "userId", "kind"})
    public static class Receipt {
        public long messageLocalId;
        public long userId;
        @NonNull public String kind = "delivered";   // delivered | read
        public long at;
    }

    @Entity(tableName = "drafts")
    public static class Draft {
        @PrimaryKey public long chatId;
        public String text;
        public long updatedAt;
    }

    // ------------------------------------------------------------------ DAO

    @Dao
    public interface ChatDao {
        // conversations
        @Insert(onConflict = OnConflictStrategy.REPLACE) void upsertConvs(List<Conv> c);
        @Insert(onConflict = OnConflictStrategy.REPLACE) void upsertConv(Conv c);
        @Query("SELECT * FROM conversations ORDER BY lastAt DESC") List<Conv> convs();
        @Query("SELECT * FROM conversations WHERE chatId = :id") Conv conv(long id);
        @Query("SELECT * FROM conversations WHERE type = 'direct' AND peerId = :peer LIMIT 1") Conv convForPeer(long peer);
        @Query("DELETE FROM conversations WHERE chatId NOT IN (:keep)") void deleteConvsNotIn(List<Long> keep);
        @Query("UPDATE conversations SET unread = 0 WHERE chatId = :id") void clearUnread(long id);
        @Query("UPDATE conversations SET lastPreview = :preview, lastAt = :at WHERE chatId = :id") void setPreview(long id, String preview, long at);
        @Query("UPDATE conversations SET syncCursor = :cursor WHERE chatId = :id") void setCursor(long id, long cursor);

        // messages
        @Insert long insertMsg(Msg m);
        @Update void updateMsg(Msg m);
        @Query("SELECT * FROM messages WHERE localId = :id") Msg byLocal(long id);
        @Query("SELECT * FROM messages WHERE senderId = :sender AND clientMessageId = :cid LIMIT 1") Msg byClient(long sender, String cid);
        @Query("SELECT * FROM messages WHERE chatId = :chat AND serverId = :sid LIMIT 1") Msg byServer(long chat, long sid);
        @Query("SELECT * FROM (SELECT * FROM messages WHERE chatId = :chat AND deleted = 0 ORDER BY sortTs DESC, localId DESC LIMIT :n) ORDER BY sortTs ASC, localId ASC")
        List<Msg> window(long chat, int n);
        @Query("SELECT COUNT(*) FROM messages WHERE chatId = :chat AND deleted = 0") int count(long chat);
        @Query("SELECT IFNULL(MIN(serverId), 0) FROM messages WHERE chatId = :chat AND serverId > 0") long minServerId(long chat);
        @Query("SELECT COUNT(*) FROM messages WHERE chatId = :chat AND serverId > 0 AND serverId < :before AND deleted = 0") int countBefore(long chat, long before);
        @Query("SELECT * FROM messages WHERE chatId = :chat AND deleted = 0 ORDER BY sortTs DESC, localId DESC LIMIT 1") Msg newest(long chat);
        @Query("SELECT * FROM messages WHERE mine = 1 AND status = 0 ORDER BY sortTs ASC, localId ASC") List<Msg> queued();
        @Query("SELECT COUNT(*) FROM messages WHERE mine = 1 AND status = 0") int queuedCount();

        // attachments / reactions / receipts
        @Insert void insertAtts(List<Att> a);
        @Query("DELETE FROM attachments WHERE messageLocalId = :id") void delAtts(long id);
        @Query("SELECT * FROM attachments WHERE messageLocalId IN (:ids)") List<Att> attsFor(List<Long> ids);
        @Insert(onConflict = OnConflictStrategy.REPLACE) void insertReacts(List<React> r);
        @Query("DELETE FROM reactions WHERE messageLocalId = :id") void delReacts(long id);
        @Query("SELECT * FROM reactions WHERE messageLocalId IN (:ids)") List<React> reactsFor(List<Long> ids);
        @Insert(onConflict = OnConflictStrategy.REPLACE) void insertReceipts(List<Receipt> r);
        @Query("SELECT * FROM receipts WHERE messageLocalId IN (:ids)") List<Receipt> receiptsFor(List<Long> ids);

        // drafts
        @Insert(onConflict = OnConflictStrategy.REPLACE) void putDraft(Draft d);
        @Query("SELECT * FROM drafts WHERE chatId = :chat") Draft draft(long chat);
        @Query("DELETE FROM drafts WHERE chatId = :chat") void delDraft(long chat);
    }

    public abstract ChatDao dao();

    // ------------------------------------------------------------------ lifecycle

    private static volatile NecpraDb inst;

    static NecpraDb get(Context c) {
        NecpraDb d = inst;
        if (d != null) return d;
        synchronized (NecpraDb.class) {
            if (inst == null) {
                inst = Room.databaseBuilder(c.getApplicationContext(), NecpraDb.class, FILE)
                        .fallbackToDestructiveMigration()
                        .build();
            }
            return inst;
        }
    }

    /** Closes and deletes the chat database (logout / account switch). */
    static synchronized void wipe(Context c) {
        try { if (inst != null) inst.close(); } catch (Exception ignored) { }
        inst = null;
        try { c.getApplicationContext().deleteDatabase(FILE); } catch (Exception ignored) { }
    }
}
