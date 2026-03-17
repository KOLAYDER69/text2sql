"use client";

import { useState, useEffect } from "react";
import { FeatureWidget } from "./feature-widget";

export function FeatureProvider() {
  const [role, setRole] = useState<string | undefined>();
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (d?.user) setRole(d.user.role); })
      .catch(() => {})
      .finally(() => setLoaded(true));
  }, []);

  // Only render for authenticated users
  if (!loaded || !role) return null;

  return <FeatureWidget userRole={role} />;
}
