import {
  Boxes,
  CircleAlert,
  ClipboardCheck,
  Cpu,
  LayoutDashboard,
  Map,
  ShieldCheck,
} from "lucide-react";
import { NavLink } from "react-router-dom";

import { cn } from "../../utils/cn";

const navigationItems = [
  { label: "Overview", path: "/overview", icon: LayoutDashboard },
  { label: "PDMs", path: "/pdms", icon: Boxes },
  { label: "Equipment", path: "/equipment", icon: Cpu },
  { label: "Issues", path: "/issues", icon: CircleAlert },
  { label: "EPS Test Execution", path: "/eps-test-execution", icon: ClipboardCheck },
  { label: "Power Plan", path: "/power-plan", icon: Map },
  { label: "Data Quality", path: "/data-quality", icon: ShieldCheck },
];

export function Sidebar() {
  return (
    <aside className="flex w-full shrink-0 flex-col border-b bg-card md:min-h-screen md:w-64 md:border-b-0 md:border-r">
      <div className="border-b px-5 py-5">
        <div className="text-sm font-semibold tracking-normal">IAD06</div>
        <div className="mt-1 text-xs text-muted-foreground">Engineering dashboard</div>
      </div>
      <nav className="flex gap-1 overflow-x-auto p-3 md:flex-col md:overflow-visible">
        {navigationItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              className={({ isActive }) =>
                cn(
                  "inline-flex min-h-10 shrink-0 items-center gap-2 rounded-md px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground md:w-full",
                  isActive && "bg-accent text-accent-foreground",
                )
              }
              key={item.path}
              to={item.path}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              {item.label}
            </NavLink>
          );
        })}
      </nav>
    </aside>
  );
}
