import type { ReactNode } from "react";

/** Le titre commun aux cinq pages internes : h2 + sous-titre discret. */
export function ViewHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className={`mb-[14px] flex flex-wrap items-baseline gap-[14px] ${
        action ? "justify-between" : ""
      }`}
    >
      <div className="flex flex-wrap items-baseline gap-[14px]">
        <h2 className="m-0 text-[22px] font-black tracking-[-0.02em]">{title}</h2>
        {subtitle && <span className="text-[13px] text-white/45">{subtitle}</span>}
      </div>
      {action}
    </div>
  );
}
