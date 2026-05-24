import admin from "firebase-admin";

let ready = false;

const DATABASE_URL =
  process.env.FIREBASE_DATABASE_URL ??
  "https://whispers-2c228-default-rtdb.firebaseio.com";

const FIREBASE_API_KEY =
  process.env.FIREBASE_API_KEY ?? "AIzaSyDGRe8PpRyfNJD1ga1yIqr6dzSGHaQHML0";

let useAdminSdk = false;

export async function initFirebaseAdmin(): Promise<void> {
  if (ready) return;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    const cred = JSON.parse(serviceAccountJson) as admin.ServiceAccount;
    admin.initializeApp({
      credential: admin.credential.cert(cred),
      databaseURL: DATABASE_URL,
    });
    useAdminSdk = true;
  } else if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    admin.initializeApp({ databaseURL: DATABASE_URL });
    useAdminSdk = true;
  }

  ready = true;
}

async function verifyTokenRest(idToken: string): Promise<string> {
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${FIREBASE_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken }),
    },
  );
  if (!res.ok) throw new Error("Invalid or expired token");
  const data = (await res.json()) as { users?: { localId: string }[] };
  const uid = data.users?.[0]?.localId;
  if (!uid) throw new Error("Invalid or expired token");
  return uid;
}

async function isRoomMemberRest(
  idToken: string,
  roomCode: string,
  uid: string,
): Promise<boolean> {
  const url = `${DATABASE_URL}/rooms/${roomCode}/users/${uid}.json?auth=${encodeURIComponent(idToken)}`;
  const res = await fetch(url);
  if (!res.ok) return false;
  const val = await res.json();
  return val === true;
}

export async function verifyRoomMember(
  idToken: string,
  roomCode: string,
): Promise<{ uid: string }> {
  await initFirebaseAdmin();

  if (useAdminSdk) {
    let decoded: admin.auth.DecodedIdToken;
    try {
      decoded = await admin.auth().verifyIdToken(idToken);
    } catch {
      throw new Error("Invalid or expired token");
    }

    const memberSnap = await admin
      .database()
      .ref(`rooms/${roomCode}/users/${decoded.uid}`)
      .get();

    if (memberSnap.val() !== true) {
      throw new Error("User is not a room member");
    }

    return { uid: decoded.uid };
  }

  const uid = await verifyTokenRest(idToken);
  const isMember = await isRoomMemberRest(idToken, roomCode, uid);
  if (!isMember) {
    throw new Error("User is not a room member");
  }

  return { uid };
}
