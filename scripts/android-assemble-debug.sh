#!/usr/bin/env bash
# Builds android/app debug APK with JDK 17 (fixes invalid source release: 21).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ANDROID_DIR="$ROOT/android"

detect_java17_home() {
  # Respect explicit JDK if already Java 17
  if [[ -n "${JAVA_HOME:-}" && -x "${JAVA_HOME}/bin/java" ]]; then
    local ver
    ver="$("${JAVA_HOME}/bin/java" -version 2>&1 | head -1 || true)"
    if [[ "$ver" == *"17"* ]] || [[ "$ver" == *"openjdk version \"17"* ]]; then
      echo "${JAVA_HOME}"
      return 0
    fi
  fi

  # macOS system picker
  if [[ -x /usr/libexec/java_home ]]; then
    local mac_home
    mac_home="$(/usr/libexec/java_home -v 17 2>/dev/null || true)"
    if [[ -n "${mac_home}" ]]; then
      echo "${mac_home}"
      return 0
    fi
  fi

  # Homebrew layouts
  local brew_home
  for brew_home in \
    "/opt/homebrew/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home" \
    "/usr/local/opt/openjdk@17/libexec/openjdk.jdk/Contents/Home"; do
    if [[ -x "${brew_home}/bin/java" ]]; then
      echo "${brew_home}"
      return 0
    fi
  done

  return 1
}

JAVA17_HOME="$(detect_java17_home)" || {
  echo "ERROR: Could not find JDK 17." >&2
  echo "Install OpenJDK 17 (e.g. brew install openjdk@17), then either:" >&2
  echo "  export JAVA_HOME=\$(/usr/libexec/java_home -v 17)" >&2
  echo "or uncomment org.gradle.java.home in android/gradle.properties" >&2
  exit 1
}

export JAVA_HOME="$JAVA17_HOME"
echo "[android-assemble-debug] JAVA_HOME=$JAVA_HOME"

cd "$ANDROID_DIR"

echo "[android-assemble-debug] Stopping Gradle daemons..."
./gradlew --stop 2>/dev/null || true

# Optional light refresh (avoid wiping entire ~/.gradle/caches — too disruptive)
echo "[android-assemble-debug] assembleDebug..."
./gradlew --no-daemon \
  "-Dorg.gradle.java.home=${JAVA_HOME}" \
  clean assembleDebug

APK="$(find "$ANDROID_DIR/app/build/outputs/apk/debug" -name '*.apk' 2>/dev/null | head -1 || true)"
if [[ -n "$APK" ]]; then
  echo "[android-assemble-debug] APK: $APK"
fi
