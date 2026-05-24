import { useEffect } from "react";
import { enableOfflinePersistence } from "@/lib/firebase";
import { initUserId } from "@/lib/user-id";

export function FirebaseInit() {
  useEffect(() => {
    void (async () => {
      await initUserId();
      await enableOfflinePersistence();
    })();
  }, []);
  return null;
}
