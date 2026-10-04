// Android <-> web attachment crypto interop. The web side (tests/attachment_web_side.js) is a line-for-line copy of
// encryptAttachment/decryptAttachment in js/message-e2e-core.js running on Node's WebCrypto.
//
// Run from the repo root (needs org.json on the classpath, same as the other tests in this folder):
//   S=android/app/src/main/java/com/necpa
//   javac -cp <org.json> -d out $S/NecpraB64.java $S/NecpraRatchet.java $S/NecpraAttachmentCrypto.java $S/NecpraE2E.java tests/AttachmentInteropTest.java
//   java  -cp out:<org.json> com.necpa.AttachmentInteropTest
package com.necpa;

import org.json.JSONObject;
import java.nio.file.*;
import java.util.*;

public class AttachmentInteropTest {
  static int fails = 0;
  static void check(String n, boolean ok) { if (!ok) fails++; System.out.println((ok ? "PASS " : "FAIL ") + n); }
  static void js(String... args) throws Exception {
    List<String> cmd = new ArrayList<>(List.of("node", System.getProperty("necpra.webside", "tests/attachment_web_side.js"))); cmd.addAll(Arrays.asList(args));
    Process p = new ProcessBuilder(cmd).redirectErrorStream(true).start();
    String out = new String(p.getInputStream().readAllBytes());
    if (p.waitFor() != 0) throw new RuntimeException("node failed: " + out);
  }
  static NecpraE2E engine(String myId, JSONObject me, JSONObject peer, String peerId) throws Exception {
    NecpraE2E.KeyDirectory dir = (uid, force) -> new NecpraE2E.PeerKey(peer.getString("pub"), "k-" + peerId);
    NecpraE2E.SessionStore st = new NecpraE2E.SessionStore() {
      public JSONObject load(String p) { return null; } public void save(String p, JSONObject s) { } public void clear(String p) { } };
    return new NecpraE2E(myId, me.getString("priv"), me.getString("pub"), "k-" + myId, dir, st);
  }
  public static void main(String[] x) throws Exception {
    Path d = Files.createTempDirectory("att");
    js("ident", d.resolve("alice.json").toString()); js("ident", d.resolve("bob.json").toString());
    JSONObject alice = new JSONObject(Files.readString(d.resolve("alice.json"))), bob = new JSONObject(Files.readString(d.resolve("bob.json")));
    // ids chosen so numeric and string ordering differ ("10" < "9" as strings): proves the sort matches JS .sort()
    String aId = "9", bId = "10";
    check("info() sorts like JS Array.sort", NecpraAttachmentCrypto.info(aId, bId).equals("kynecta-dm-v2:10:9:attachment"));

    byte[] file = new byte[300_000]; new Random(7).nextBytes(file);
    Files.write(d.resolve("file.bin"), file);

    // 1. Android (alice) -> web (bob)
    JSONObject env = engine(aId, alice, bob, bId).encryptAttachment(file, bId);
    Files.writeString(d.resolve("env1.json"), env.toString());
    js("dec", d.resolve("bob.json").toString(), bId, d.resolve("env1.json").toString(), aId, d.resolve("out1.bin").toString());
    check("Android->web: web decryptAttachment reads native envelope", Arrays.equals(file, Files.readAllBytes(d.resolve("out1.bin"))));
    check("envelope shape {v:2,spk,iv,ct}", env.getInt("v") == 2 && env.has("spk") && env.has("iv") && env.has("ct") && env.length() == 4);

    // 2. web (bob) -> Android (alice)
    js("enc", d.resolve("bob.json").toString(), bId, d.resolve("alice.json").toString(), aId, d.resolve("file.bin").toString(), d.resolve("env2.json").toString());
    byte[] got = engine(aId, alice, bob, bId).decryptAttachment(new JSONObject(Files.readString(d.resolve("env2.json"))), bId, false);
    check("web->Android: native decrypts web envelope", Arrays.equals(file, got));

    // 3. my own sent file read back later on this device (spk is MY key, so the peer's directory key must be used)
    byte[] own = engine(aId, alice, bob, bId).decryptAttachment(env, bId, true);
    check("own sent attachment decrypts via directory key", Arrays.equals(file, own));

    // 4. tamper and wrong-peer must fail
    JSONObject bad = new JSONObject(env.toString()); String ct = bad.getString("ct"); bad.put("ct", (ct.charAt(10) == 'A' ? "B" : "A") + ct.substring(1, 10) + ct.substring(10).replaceFirst(".", ct.charAt(10) == 'A' ? "B" : "A"));
    boolean threw = false; try { engine(aId, alice, bob, bId).decryptAttachment(bad, bId, false); } catch (Exception e) { threw = true; }
    check("tampered ciphertext is rejected", threw);
    threw = false; try { engine("77", alice, bob, bId).decryptAttachment(new JSONObject(Files.readString(d.resolve("env2.json"))), bId, false); } catch (Exception e) { threw = true; }
    check("wrong user-id context is rejected", threw);

    System.out.println(fails == 0 ? "ALL PASS" : fails + " FAILED");
    System.exit(fails == 0 ? 0 : 1);
  }
}
