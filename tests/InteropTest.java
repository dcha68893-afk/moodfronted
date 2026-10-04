import com.necpa.NecpraRatchet;
import org.json.JSONObject;
import java.io.*; import java.nio.file.*; import java.security.*; import java.security.spec.*; import java.util.*;

public class InteropTest {
  static Path dir;
  static int fails = 0;
  static String js(String... args) throws Exception {
    List<String> cmd = new ArrayList<>(List.of("node", "test/jsside.js")); cmd.addAll(Arrays.asList(args));
    Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
    String out = new String(p.getInputStream().readAllBytes()); int rc = p.waitFor();
    if (rc != 0) throw new RuntimeException("node failed: " + out);
    return out;
  }
  static void check(String name, String got, String want) { boolean ok = want.equals(got); if (!ok) fails++; System.out.println((ok ? "PASS " : "FAIL ") + name + (ok ? "" : "  got=" + got + " want=" + want)); }
  static String f(String n) { return dir.resolve(n).toString(); }
  static JSONObject read(String n) throws Exception { return new JSONObject(Files.readString(dir.resolve(n))); }
  static void write(String n, JSONObject o) throws Exception { Files.writeString(dir.resolve(n), o.toString()); }

  // Java-side identity handling exactly as NecpraE2E will do it: PKCS8 priv, SPKI peer pub.
  static byte[] sharedWith(JSONObject me, JSONObject peer) throws Exception {
    PrivateKey priv = KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(me.getString("priv"))));
    PublicKey pub = KeyFactory.getInstance("EC").generatePublic(new X509EncodedKeySpec(Base64.getDecoder().decode(peer.getString("pub"))));
    javax.crypto.KeyAgreement ka = javax.crypto.KeyAgreement.getInstance("ECDH"); ka.init(priv); ka.doPhase(pub, true); return ka.generateSecret();
  }
  static PrivateKey priv(JSONObject me) throws Exception { return KeyFactory.getInstance("EC").generatePrivate(new PKCS8EncodedKeySpec(Base64.getDecoder().decode(me.getString("priv")))); }

  public static void main(String[] a) throws Exception {
    dir = Files.createTempDirectory("interop");
    js("ident", f("alice.json")); js("ident", f("bob.json"));
    JSONObject alice = read("alice.json"), bob = read("bob.json");

    // 1. JS (alice) -> Java (bob): first contact, then in-order
    js("enc", f("alice.json"), f("bob.json"), f("a.sess"), "hello bob ✓ ünïcode 😀", f("e1.json"));
    js("enc", f("alice.json"), f("bob.json"), f("a.sess"), "second message", f("e2.json"));
    JSONObject bobSess = NecpraRatchet.initSessionAsReceiver(sharedWith(bob, alice), NecpraRatchet.jwkFromPrivate(priv(bob)), read("e1.json").getJSONObject("hdr").getString("dh"));
    check("JS->Java msg1 (first contact, unicode)", NecpraRatchet.ratchetDecrypt(bobSess, read("e1.json")), "hello bob ✓ ünïcode 😀");
    check("JS->Java msg2", NecpraRatchet.ratchetDecrypt(bobSess, read("e2.json")), "second message");

    // 2. Java (bob) -> JS (alice): DH ratchet step
    JSONObject r1 = NecpraRatchet.ratchetEncrypt(bobSess, "reply from java");
    write("r1.json", r1);
    check("Java->JS reply", js("dec", f("alice.json"), f("bob.json"), f("a.sess"), f("r1.json")), "reply from java");

    // 3. JS -> Java after JS ratchets again; out-of-order delivery (skipped keys)
    js("enc", f("alice.json"), f("bob.json"), f("a.sess"), "m3", f("e3.json"));
    js("enc", f("alice.json"), f("bob.json"), f("a.sess"), "m4", f("e4.json"));
    js("enc", f("alice.json"), f("bob.json"), f("a.sess"), "m5", f("e5.json"));
    check("JS->Java out-of-order m5 first", NecpraRatchet.ratchetDecrypt(bobSess, read("e5.json")), "m5");
    check("JS->Java out-of-order m3 (skipped)", NecpraRatchet.ratchetDecrypt(bobSess, read("e3.json")), "m3");
    check("JS->Java out-of-order m4 (skipped)", NecpraRatchet.ratchetDecrypt(bobSess, read("e4.json")), "m4");

    // 4. Session state round-trip: Java session -> JSON text -> Java; and Java continues JS-created session state
    JSONObject reloaded = new JSONObject(bobSess.toString());
    write("r2.json", NecpraRatchet.ratchetEncrypt(reloaded, "after reload"));
    check("Java persisted-state -> JS", js("dec", f("alice.json"), f("bob.json"), f("a.sess"), f("r2.json")), "after reload");
    JSONObject migrated = new JSONObject(Files.readString(dir.resolve("a.sess"))); // a session file written by the REAL web code
    write("m1.json", NecpraRatchet.ratchetEncrypt(migrated, "java continues a web-created session"));
    // alice's JS state file is now behind the Java-advanced copy; JS decrypts the Java envelope with its ORIGINAL state:
    check("Java continues web-created session -> Java peer", NecpraRatchet.ratchetDecrypt(reloaded, read("m1.json")), "java continues a web-created session");

    // 5. tamper / replay must fail
    try { NecpraRatchet.ratchetDecrypt(new JSONObject(bobSess.toString()), read("e1.json")); check("replay rejected", "accepted", "rejected"); }
    catch (Exception e) { check("replay rejected", "rejected", "rejected"); }
    JSONObject bad = read("e2.json"); bad.getJSONObject("hdr").put("n", 7);
    try { NecpraRatchet.ratchetDecrypt(new JSONObject(bobSess.toString()), bad); check("header tamper rejected", "accepted", "rejected"); }
    catch (Exception e) { check("header tamper rejected", "rejected", "rejected"); }

    System.out.println(fails == 0 ? "ALL PASSED" : (fails + " FAILED")); System.exit(fails == 0 ? 0 : 1);
  }
}
