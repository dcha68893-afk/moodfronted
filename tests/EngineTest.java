import com.necpa.NecpraE2E;
import org.json.JSONObject;
import java.nio.file.*; import java.util.*;

public class EngineTest {
  static Path dir; static int fails = 0;
  static String js(String... args) throws Exception {
    List<String> cmd = new ArrayList<>(List.of("node", "test/jsside.js")); cmd.addAll(Arrays.asList(args));
    Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
    String out = new String(p.getInputStream().readAllBytes(), "UTF-8"); int rc = p.waitFor();
    if (rc != 0) throw new RuntimeException("node failed: " + out); return out;
  }
  static void check(String n, Object got, Object want) { boolean ok = String.valueOf(want).equals(String.valueOf(got)); if (!ok) fails++; System.out.println((ok ? "PASS " : "FAIL ") + n + (ok ? "" : "  got=" + got + " want=" + want)); }
  static String f(String n) { return dir.resolve(n).toString(); }
  static JSONObject read(String n) throws Exception { return new JSONObject(Files.readString(dir.resolve(n))); }
  static class Mem implements NecpraE2E.SessionStore {
    Map<String, JSONObject> m = new HashMap<>();
    public JSONObject load(String p) { try { return m.containsKey(p) ? new JSONObject(m.get(p).toString()) : null; } catch (Exception e) { throw new RuntimeException(e); } }
    public void save(String p, JSONObject s) { try { m.put(p, new JSONObject(s.toString())); } catch (Exception e) { throw new RuntimeException(e); } }
    public void clear(String p) { m.remove(p); }
  }
  public static void main(String[] a) throws Exception {
    dir = Files.createTempDirectory("engine");
    js("ident", f("me.json")); js("ident", f("alice.json"));
    JSONObject me = read("me.json"), alice = read("alice.json");
    Map<String, NecpraE2E.PeerKey> dirMap = new HashMap<>(); dirMap.put("2", new NecpraE2E.PeerKey(alice.getString("pub"), "alice-key-1"));
    NecpraE2E.KeyDirectory kd = (id, force) -> dirMap.get(id);

    // identity backup written by the web code unwraps natively
    js("wrap", f("me.json"), "s3cret-wrap-secret", f("wrapped.json"));
    String pkcs8 = NecpraE2E.unwrapPrivate(Files.readString(dir.resolve("wrapped.json")), "s3cret-wrap-secret");
    check("unwrapPrivate matches web wrapPrivate", pkcs8, me.getString("priv"));
    try { NecpraE2E.unwrapPrivate(Files.readString(dir.resolve("wrapped.json")), "wrong"); check("wrong secret rejected", "accepted", "rejected"); } catch (Exception e) { check("wrong secret rejected", "rejected", "rejected"); }

    Mem store = new Mem();
    NecpraE2E e2e = new NecpraE2E("1", pkcs8, me.getString("pub"), "me-key-1", kd, store);

    // native -> web
    String env1 = e2e.encrypt("hi from native", "2");
    Files.writeString(dir.resolve("n1.json"), env1);
    JSONObject parsed = new JSONObject(env1);
    check("envelope carries v/spk/kid/rkid", parsed.getInt("v") + "|" + parsed.getString("spk").equals(me.getString("pub")) + "|" + parsed.getString("kid") + "|" + parsed.getString("rkid"), "3|true|me-key-1|alice-key-1");
    check("native->web decrypt", js("dec", f("alice.json"), f("me.json"), f("aw.sess"), f("n1.json")), "hi from native");

    // web -> native (alice already has a session; she replies)
    js("enc", f("alice.json"), f("me.json"), f("aw.sess"), "web reply", f("w1.json"));
    JSONObject w1 = read("w1.json"); w1.put("spk", alice.getString("pub")); w1.put("kid", "alice-key-1"); // web clients attach spk
    check("web->native decrypt", e2e.decrypt(w1.toString(), "2", false), "web reply");

    // first contact from a brand-new peer using only the embedded spk (directory knows nothing)
    js("ident", f("bob.json")); JSONObject bob = read("bob.json");
    js("enc", f("bob.json"), f("me.json"), f("bw.sess"), "first contact from bob", f("b1.json"));
    JSONObject b1 = read("b1.json"); b1.put("spk", bob.getString("pub"));
    Mem store2 = new Mem(); NecpraE2E e2 = new NecpraE2E("1", pkcs8, me.getString("pub"), "me-key-1", (id, force) -> { throw new RuntimeException("directory unreachable"); }, store2);
    check("first contact via spk only (offline directory)", e2.decrypt(b1.toString(), "3", false), "first contact from bob");

    // peer reinstalls: brand-new sender session while native still holds the OLD session -> recovery
    Files.delete(dir.resolve("aw.sess"));
    js("enc", f("alice.json"), f("me.json"), f("aw.sess"), "after alice reinstall", f("w2.json"));
    JSONObject w2 = read("w2.json"); w2.put("spk", alice.getString("pub")); w2.put("kid", "alice-key-1");
    check("peer-session reset recovery", e2e.decrypt(w2.toString(), "2", false), "after alice reinstall");
    js("enc", f("alice.json"), f("me.json"), f("aw.sess"), "and the chain keeps working", f("w3.json"));
    JSONObject w3 = read("w3.json"); w3.put("spk", alice.getString("pub")); w3.put("kid", "alice-key-1");
    check("chain continues after recovery", e2e.decrypt(w3.toString(), "2", false), "and the chain keeps working");

    // a bad message must not wipe the healthy session
    JSONObject junk = new JSONObject(w3.toString()); junk.put("ct", Base64.getEncoder().encodeToString(new byte[40]));
    try { e2e.decrypt(junk.toString(), "2", false); check("corrupt message rejected", "accepted", "rejected"); } catch (Exception e) { check("corrupt message rejected", "rejected", "rejected"); }
    js("enc", f("alice.json"), f("me.json"), f("aw.sess"), "still healthy", f("w4.json"));
    JSONObject w4 = read("w4.json"); w4.put("spk", alice.getString("pub")); w4.put("kid", "alice-key-1");
    check("session survives a corrupt message", e2e.decrypt(w4.toString(), "2", false), "still healthy");

    // recipient key rotation: new keyId -> fresh sending session to the new key
    js("ident", f("alice2.json")); JSONObject alice2 = read("alice2.json");
    dirMap.put("2", new NecpraE2E.PeerKey(alice2.getString("pub"), "alice-key-2"));
    Files.writeString(dir.resolve("n2.json"), e2e.encrypt("to rotated key", "2"));
    check("encrypt after recipient key rotation", js("dec", f("alice2.json"), f("me.json"), f("a2.sess"), f("n2.json")), "to rotated key");

    // guards
    try { e2e.decrypt(env1, "2", true); check("own message refused", "decrypted", "OwnMessage"); } catch (NecpraE2E.OwnMessage e) { check("own message refused", "OwnMessage", "OwnMessage"); }
    String v2 = "{\"v\":2,\"iv\":\"AA==\",\"ct\":\"AA==\",\"spk\":\"AA==\"}";
    try { e2e.decrypt(v2, "2", false); check("v2 reported unsupported", "decrypted", "Unsupported"); } catch (NecpraE2E.Unsupported e) { check("v2 reported unsupported", "Unsupported", "Unsupported"); }
    check("looksEncrypted(v5 devices)", NecpraE2E.looksEncrypted("{\"v\":5,\"mid\":\"x\",\"devices\":{\"d\":{\"iv\":\"a\",\"ct\":\"b\"}}}"), true);
    check("looksEncrypted(plain text)", NecpraE2E.looksEncrypted("hello {world}"), false);

    System.out.println(fails == 0 ? "ALL PASSED" : (fails + " FAILED")); System.exit(fails == 0 ? 0 : 1);
  }
}
