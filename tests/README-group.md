# Group (Sender Keys v2) interop test

Runs the Java port `NecpraGroupE2E` against the REAL, unmodified web client `js/groupMessaging.client.js`
(WEB->JAVA, JAVA->WEB, out-of-order, state reload, new device, tamper/forgery rejection).

    S=android/app/src/main/java/com/necpa
    javac -cp <org.json.jar> -d out $S/NecpraB64.java $S/NecpraRatchet.java $S/NecpraGroupE2E.java tests/GroupInteropTest.java
    java  -cp out:<org.json.jar> GroupInteropTest        # needs `node` (>= 20) on PATH; expects "ALL PASS"
