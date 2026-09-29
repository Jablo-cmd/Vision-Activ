import {
  BarChart3,
  Bell,
  ClipboardCheck,
  Compass,
  FileText,
  Gauge,
  History,
  LayoutDashboard,
  ListChecks,
  ScrollText,
  Target,
  UserCog,
  Users,
  type LucideIcon,
} from "lucide-react";
import { EXECUTIVE_ROLES, MANAGEMENT_ROLES, type Role } from "../domain";

export type NavItem = { to: string; label: string; icon: LucideIcon; end?: boolean };
export type NavGroup = { title: string; roles?: readonly Role[]; items: NavItem[] };

export const NAV: NavGroup[] = [
  {
    title: "My performance",
    items: [
      { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/baseline", label: "Baseline assessment", icon: ClipboardCheck },
      { to: "/weekly", label: "Weekly scorecard", icon: Gauge },
      { to: "/commitments", label: "Commitments", icon: FileText },
      { to: "/track", label: "Track & Improve", icon: Target },
      { to: "/trends", label: "Trends", icon: BarChart3 },
      { to: "/review", label: "Reviews", icon: History },
      { to: "/notifications", label: "Notifications", icon: Bell },
    ],
  },
  {
    title: "Management",
    roles: MANAGEMENT_ROLES,
    items: [
      { to: "/cockpit", label: "Cockpit", icon: Compass },
      { to: "/team", label: "Team", icon: Users, end: true },
      { to: "/team/commitments", label: "Team commitments", icon: ListChecks },
      { to: "/reports", label: "Reports", icon: FileText },
    ],
  },
  {
    title: "Administration",
    roles: EXECUTIVE_ROLES,
    items: [
      { to: "/people", label: "People", icon: UserCog },
      { to: "/audit", label: "Audit log", icon: ScrollText },
    ],
  },
];

export function navFor(role: Role | null): NavGroup[] {
  return NAV.filter((g) => !g.roles || (role !== null && g.roles.includes(role)));
}
