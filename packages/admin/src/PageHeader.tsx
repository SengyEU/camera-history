import type { ReactNode } from "react";

export function PageHeader({
  kicker = "Workspace",
  title,
  description,
  children,
}: {
  kicker?: string;
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <header className="page-head">
      <div className="page-head-copy">
        <p className="page-kicker">{kicker}</p>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children && <div className="page-actions">{children}</div>}
    </header>
  );
}
