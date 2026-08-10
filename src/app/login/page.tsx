import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

export const metadata = { title: "Twaylo OS — Connexion" };

export default function LoginPage() {
  return (
    // `cadre-appli` et non `min-h-screen` : `100vh` dépasse la hauteur visible
    // sur iPhone, et cet écran-ci n'a rien à faire défiler.
    <div className="cadre-appli relative flex items-center justify-center overflow-hidden px-6">
      <div
        className="pointer-events-none absolute -top-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, rgba(255,61,139,0.14), transparent 70%)",
        }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 left-1/2 h-[420px] w-[420px] -translate-x-1/2 rounded-full blur-[90px]"
        style={{
          background: "radial-gradient(circle, rgba(34,211,238,0.12), transparent 70%)",
        }}
      />
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
