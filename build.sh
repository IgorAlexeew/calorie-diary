#!/bin/bash
# Builds the APK without the Android SDK or Gradle: aapt2 + javac + dx + apksig (see README).
# Same inputs as build.gradle: ODIROUTER_* and SIGNING_* from the environment, then secrets.properties.
set -euo pipefail
A=$(cd "$(dirname "$0")" && pwd)
T=${TOOLS:-$HOME/tools}; O=$A/out
prop() { local v="${!1:-}"; [ -z "$v" ] && [ -f "$A/secrets.properties" ] && v=$(grep -E "^$1=" "$A/secrets.properties" | tail -1 | cut -d= -f2- || true); echo "${v:-$2}"; }
KEY=$(prop ODIROUTER_API_KEY ""); MODEL=$(prop ODIROUTER_MODEL free-vclaude-haiku-4.5); BASE=$(prop ODIROUTER_BASE https://api.odirouter.ai/v1)
KS=$(prop SIGNING_KEYSTORE "$A/signing/release.p12"); PW=$(prop SIGNING_PASSWORD "")
[ -z "$PW" ] && [ -f "$(dirname "$KS")/password.txt" ] && PW=$(cat "$(dirname "$KS")/password.txt")
VC=$(prop VERSION_CODE "$(grep -oP "'VERSION_CODE', '\K\d+" "$A/build.gradle")"); VN=$(prop VERSION_NAME "$(grep -oP "'VERSION_NAME', '\K[^']+" "$A/build.gradle")")
jstr() { python3 -c 'import json,sys; print(json.dumps(sys.argv[1]))' "$1"; }

rm -rf "$O" && mkdir -p "$O/res" "$O/classes" "$O/gen/app/caloriediary"
sed 's|<manifest xmlns:android="http://schemas.android.com/apk/res/android">|<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="app.caloriediary">|' "$A/AndroidManifest.xml" > "$O/AndroidManifest.xml"
cat > "$O/gen/app/caloriediary/BuildConfig.java" <<J
package app.caloriediary;
public final class BuildConfig {
    public static final String API_KEY = $(jstr "$KEY");
    public static final String MODEL = $(jstr "$MODEL");
    public static final String API_BASE = $(jstr "$BASE");
}
J
"$T/aapt2" compile --dir "$A/res" -o "$O/res/res.zip"
"$T/aapt2" link -o "$O/base.apk" -I "$T/android.jar" --manifest "$O/AndroidManifest.xml" -A "$A/assets" --java "$O/gen" "$O/res/res.zip" \
  --min-sdk-version 24 --target-sdk-version 34 --version-code "$VC" --version-name "$VN"
javac -nowarn -Xlint:-options -source 8 -target 8 -bootclasspath "$T/android.jar" -cp "$T/android.jar" -d "$O/classes" \
  "$O"/gen/app/caloriediary/*.java "$A"/src/app/caloriediary/*.java
java -cp "$T/dx.jar" com.android.dx.command.Main --dex --min-sdk-version=24 --output="$O/classes.dex" "$O/classes"
(cd "$O" && cp base.apk unsigned.apk && zip -q -j unsigned.apk classes.dex)
if [ ! -f "$KS" ]; then echo "no keystore at $KS, unsigned APK: $O/unsigned.apk"; exit 0; fi
mkdir -p "$O/signer" && javac -nowarn -cp "$T/apksig.jar" -d "$O/signer" "$A/signer/Sign.java"
java --add-exports java.base/sun.security.x509=ALL-UNNAMED --add-exports java.base/sun.security.pkcs=ALL-UNNAMED --add-exports java.base/sun.security.util=ALL-UNNAMED \
  -cp "$T/apksig.jar:$O/signer" Sign "$KS" "$PW" diary "$O/unsigned.apk" "$O/calorie-diary.apk" 2>&1 | grep -v Picked
