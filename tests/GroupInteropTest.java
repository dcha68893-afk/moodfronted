// Cross-language test: the Java port (NecpraGroupE2E) against the REAL web client (js/groupMessaging.client.js, unmodified).
// Run from the repo root (see tests/README-group.md):
//   javac -cp <org.json> -d out $S/NecpraB64.java $S/NecpraRatchet.java $S/NecpraGroupE2E.java tests/GroupInteropTest.java
//   java  -cp out:<org.json> GroupInteropTest
import com.necpa.NecpraGroupE2E;
import org.json.*;
import java.nio.file.*; import java.security.*; import java.security.spec.*; import java.util.*;

public class GroupInteropTest {
  static Path dir; static int fails = 0;
  static String js(String... args) throws Exception {
    List<String> cmd = new ArrayList<>(List.of("node", "tests/group_web_side.js")); cmd.addAll(Arrays.asList(args));
    Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
    String out = new String(p.getInputStream().readAllBytes(), java.nio.charset.StandardCharsets.UTF_8); int rc = p.waitFor();
    if (rc != 0) throw new RuntimeException("node failed: " + out);
    return out;
  }
  static void check(String name, String got, String want) { boolean ok = want.equals(got); if (!ok) fails++; System.out.println((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  got=" + got + " want=" + want)); }
  static void expectFail(String name, Callable c) { try { c.run(); fails++; System.out.println("FAIL " + name + " (accepted)"); } catch (Throwable t) { System.out.println("PASS " + name + "  [" + t.getClass().getSimpleName() + ": " + t.getMessage() + "]"); } }
  interface Callable { void run() throws Exception; }
  static String f(String n) { return dir.resolve(n).toString(); }

  // The backend, as user 2. Same rules as the fake server in group_web_side.js.
  static JSONObject srv() throws Exception { return new JSONObject(Files.readString(dir.resolve("server.json"), java.nio.charset.StandardCharsets.UTF_8)); }
  static void put(JSONObject s) throws Exception { Files.writeString(dir.resolve("server.json"), s.toString()); }
  static NecpraGroupE2E.Api api(long uid) { return new NecpraGroupE2E.Api() {
    public JSONObject get(String path) throws Exception {
      JSONObject s = srv(); String p = path.replaceFirst("^/api", "");
      if (p.matches("/chats/\\d+")) { JSONArray parts = new JSONArray(); JSONArray m = s.getJSONArray("members"); for (int i = 0; i < m.length(); i++) parts.put(new JSONObject().put("user", new JSONObject().put("id", m.getInt(i)))); return new JSONObject().put("data", new JSONObject().put("chat", new JSONObject().put("participants", parts))); }
      if (p.matches("/group-messages/\\d+/crypto/state")) {
        JSONArray out = new JSONArray(); JSONArray ks = s.getJSONArray("senderKeys");
        for (int i = 0; i < ks.length(); i++) { JSONObject k = ks.getJSONObject(i); JSONArray ds = k.getJSONArray("distributions"); JSONObject mine = null;
          for (int j = 0; j < ds.length(); j++) if (ds.getJSONObject(j).getLong("userId") == uid) mine = ds.getJSONObject(j);
          if (mine != null) out.put(new JSONObject().put("ownerId", k.getLong("ownerId")).put("epoch", k.getLong("epoch")).put("algorithm", NecpraGroupE2E.ALGORITHM).put("distribution", mine)); }
        return new JSONObject().put("data", new JSONObject().put("epoch", s.getLong("epoch")).put("missingMemberIds", s.optJSONArray("pendingFor") == null ? new JSONArray() : s.getJSONArray("pendingFor")).put("senderKeys", out).put("history", new JSONArray()));
      }
      throw new IllegalStateException("unhandled GET " + path);
    }
    public JSONObject post(String path, JSONObject body) throws Exception {
      String p = path.replaceFirst("^/api", "");
      if (p.matches("/group-messages/\\d+/crypto/rotate")) {
        JSONObject s = srv(); if (body.getLong("epoch") != s.getLong("epoch")) throw new NecpraGroupE2E.ApiException(409, null, "Invalid group encryption epoch");
        JSONArray keep = new JSONArray(); JSONArray ks = s.getJSONArray("senderKeys");
        for (int i = 0; i < ks.length(); i++) { JSONObject k = ks.getJSONObject(i); if (!(k.getLong("ownerId") == uid && k.getLong("epoch") == body.getLong("epoch"))) keep.put(k); }
        keep.put(new JSONObject().put("ownerId", uid).put("epoch", body.getLong("epoch")).put("distributions", body.getJSONArray("distributions")));
        s.put("senderKeys", keep); put(s); return new JSONObject().put("success", true);
      }
      if (p.endsWith("/crypto/ack")) return new JSONObject();
      throw new IllegalStateException("unhandled POST " + path);
    } }; }

  static NecpraGroupE2E.Directory directory() { return id -> srv().getJSONObject("pubkeys").getString(String.valueOf(id)); }
  static class Mem implements NecpraGroupE2E.Store { final Map<String, String> m = new HashMap<>(); public String load(String k) { return m.get(k); } public void save(String k, String v) { m.put(k, v); } }
  static PrivateKey priv(JSONObject id) throws Exception { return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(id.getString("priv")))); }
  static NecpraGroupE2E javaUser(long uid, JSONObject id, Mem store) throws Exception { return new NecpraGroupE2E(uid, priv(id), id.getString("pub"), api(uid), directory(), store); }
  static JSONObject readJson(String n) throws Exception { return new JSONObject(Files.readString(dir.resolve(n))); }
  static String webSend(String text, String out) throws Exception { Files.writeString(dir.resolve(out + ".txt"), text, java.nio.charset.StandardCharsets.UTF_8); js("send", dir.toString(), "1", "7", "@" + f(out + ".txt"), f(out)); return Files.readString(dir.resolve(out)); }
  static String webRecv(String envFile) throws Exception { return js("recv", dir.toString(), "1", "7", f(envFile)); }

  public static void main(String[] args) throws Exception {
    dir = Files.createTempDirectory("groupinterop");
    js("ident", f("ident_1.json")); js("ident", f("ident_2.json"));
    JSONObject i1 = readJson("ident_1.json"), i2 = readJson("ident_2.json");
    JSONObject s = new JSONObject().put("epoch", 1).put("members", new JSONArray().put(1).put(2))
        .put("pubkeys", new JSONObject().put("1", i1.getString("pub")).put("2", i2.getString("pub"))).put("senderKeys", new JSONArray());
    put(s);
    Mem store2 = new Mem(); NecpraGroupE2E java2 = javaUser(2, i2, store2);

    // 1. web (user 1) -> Java (user 2): creates the web sender key + distributions, unicode, then in-order
    String w1 = webSend("hello from web ✓ ünïcode 😀", "w1.json"), w2 = webSend("second", "w2.json"), w3 = webSend("third", "w3.json");
    check("envelope is recognised", String.valueOf(NecpraGroupE2E.isEnvelope(w1)), "true");
    check("WEB->JAVA msg1 (unicode)", java2.decrypt(7, w1), "hello from web ✓ ünïcode 😀");
    check("WEB->JAVA msg2", java2.decrypt(7, w2), "second");
    check("WEB->JAVA msg3", java2.decrypt(7, w3), "third");

    // 2. Java -> web: Java creates ITS sender key and wraps it for both members; the web client reads it from the server
    String j1 = java2.encrypt(7, "reply from java ✓"), j2 = java2.encrypt(7, "java two");
    Files.writeString(dir.resolve("j1.json"), j1); Files.writeString(dir.resolve("j2.json"), j2);
    check("JAVA->WEB msg1", webRecv("j1.json"), "reply from java ✓");
    check("JAVA->WEB msg2", webRecv("j2.json"), "java two");

    // 3. out-of-order (skipped message keys) in both directions
    String w4 = webSend("m4", "w4.json"), w5 = webSend("m5", "w5.json"), w6 = webSend("m6", "w6.json");
    check("WEB->JAVA out-of-order m6 first", java2.decrypt(7, w6), "m6");
    check("WEB->JAVA skipped m4", java2.decrypt(7, w4), "m4");
    check("WEB->JAVA skipped m5", java2.decrypt(7, w5), "m5");
    String j3 = java2.encrypt(7, "j3"), j4 = java2.encrypt(7, "j4"), j5 = java2.encrypt(7, "j5");
    Files.writeString(dir.resolve("j3.json"), j3); Files.writeString(dir.resolve("j4.json"), j4); Files.writeString(dir.resolve("j5.json"), j5);
    check("JAVA->WEB out-of-order j5 first", webRecv("j5.json"), "j5");
    check("JAVA->WEB skipped j3", webRecv("j3.json"), "j3");
    check("JAVA->WEB skipped j4", webRecv("j4.json"), "j4");

    // 4. state persistence: a NEW Java instance over the same store continues the same chain
    NecpraGroupE2E reloaded = javaUser(2, i2, store2);
    String j6 = reloaded.encrypt(7, "after reload"); Files.writeString(dir.resolve("j6.json"), j6);
    check("JAVA(reloaded)->WEB", webRecv("j6.json"), "after reload");
    String w7 = webSend("web after java rekey? no", "w7.json");
    check("WEB->JAVA(reloaded)", reloaded.decrypt(7, w7), "web after java rekey? no");

    // 5. new device (empty store): own old message is readable from the server's own-wrap (receiver copy), at the distributed iteration
    NecpraGroupE2E fresh = javaUser(2, i2, new Mem());
    check("JAVA new device reads web message (server distribution)", fresh.decrypt(7, w1), "hello from web ✓ ünïcode 😀");

    // 6. integrity: a flipped ciphertext, a wrong signature and a forged embedded key are all rejected
    JSONObject bad = new JSONObject(w2); String ct = bad.getString("ct"); bad.put("ct", (ct.charAt(0) == 'A' ? "B" : "A") + ct.substring(1));
    expectFail("tampered ciphertext rejected", () -> javaUser(2, i2, new Mem()).decrypt(7, bad.toString()));
    JSONObject forged = new JSONObject(w3); JSONObject other = new JSONObject(j1).getJSONObject("publicKey"); forged.put("publicKey", other);
    expectFail("forged embedded signing key rejected", () -> javaUser(2, i2, new Mem()).decrypt(7, forged.toString()));

    System.out.println(fails == 0 ? "ALL PASS" : (fails + " FAILED"));
    System.exit(fails == 0 ? 0 : 1);
  }
}
