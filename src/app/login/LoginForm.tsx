"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = params.get("next") ?? "/";

  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ password }),
      });

      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setError(body.error ?? "Connexion impossible.");
        setPassword("");
        return;
      }

      // `refresh` force le middleware à réévaluer le cookie fraîchement posé.
      router.replace(next);
      router.refresh();
    } catch {
      // Jamais de catch vide (spec Partie 10, bug 3).
      setError("Le serveur ne répond pas.");
      console.error("[login] échec de la requête");
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="panel relative z-10 w-full max-w-[380px] p-7">
      <span className="panel-accent" style={{ background: "var(--grad)" }} aria-hidden />

      <div className="flex items-center gap-[11px]">
        <div className="logo-mark relative h-[38px] w-[38px] overflow-hidden rounded-xl">
          <svg width="38" height="38" viewBox="0 0 38 38" className="block">
            <defs>
              <linearGradient id="loginGrad" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0" stopColor="#ff3d8b" />
                <stop offset="0.38" stopColor="#ffc63d" />
                <stop offset="0.7" stopColor="#3ddc84" />
                <stop offset="1" stopColor="#22d3ee" />
              </linearGradient>
            </defs>
            <rect x="1" y="1" width="36" height="36" rx="11" fill="rgba(255,255,255,0.05)" />
            <path d="M14 11 L28 19 L14 27 Z" fill="url(#loginGrad)" />
          </svg>
        </div>
        <span className="text-[22px] font-black tracking-[-0.02em]">twaylo</span>
      </div>

      <h1 className="mt-5 text-[17px] font-black tracking-[-0.01em]">
        Ton OS est verrouillé
      </h1>
      <p className="mt-1 text-[12.5px] leading-[1.45] text-white/45">
        Entre ton mot de passe pour accéder au tableau de bord.
      </p>

      <form onSubmit={onSubmit} className="mt-5">
        <label htmlFor="password" className="sr-only">
          Mot de passe
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Mot de passe"
          autoFocus
          autoComplete="current-password"
          className="w-full rounded-[13px] px-[14px] py-[12px] text-[14px] font-semibold text-white outline-none transition-colors focus:border-white/25"
          style={{
            background: "rgba(255,255,255,0.04)",
            border: "1px solid rgba(255,255,255,0.1)",
          }}
        />

        {error && (
          <div
            className="mt-3 rounded-[11px] px-3 py-[9px] text-[12.5px] font-bold"
            style={{
              color: "var(--color-mag-soft)",
              background: "rgba(255,61,139,0.1)",
              border: "1px solid rgba(255,61,139,0.25)",
            }}
            role="alert"
          >
            {error}
          </div>
        )}

        <button
          type="submit"
          disabled={pending || password.length === 0}
          className="mt-4 w-full cursor-pointer rounded-[13px] border-none py-[12px] text-[14px] font-extrabold text-[#07121d] transition-all hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: "var(--grad)" }}
        >
          {pending ? "Connexion…" : "Entrer"}
        </button>
      </form>
    </main>
  );
}
