import { useEffect, useState } from "react";
import type { Me } from "@myplayer/shared";
import { api } from "./lib/api";
import { AppShell } from "./components/AppShell";
import { Login } from "./components/Login";

export default function App() {
  const [me, setMe] = useState<Me | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    api<Me>("/api/me")
      .then(setMe)
      .catch(() => setMe(null))
      .finally(() => setReady(true));
  }, []);

  if (!ready) return <div className="min-h-dvh bg-page" />;
  return me ? <AppShell me={me} /> : <Login />;
}
