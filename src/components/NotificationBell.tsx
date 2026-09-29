import { Bell } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { unreadCount } from "../services/notifications";

export function NotificationBell() {
  const { data } = useQuery({
    queryKey: ["notifications", "unread"],
    queryFn: unreadCount,
    refetchInterval: 60_000,
  });
  const n = data ?? 0;
  return (
    <Link
      to="/notifications"
      className="relative rounded-lg p-2 text-ink-700 hover:bg-brand-50"
      aria-label={n > 0 ? `Notifications, ${n} unread` : "Notifications"}
    >
      <Bell size={20} aria-hidden="true" />
      {n > 0 && (
        <span
          aria-hidden="true"
          className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-bad-700 px-1 text-center text-[11px] font-bold leading-5 text-white"
        >
          {n > 99 ? "99+" : n}
        </span>
      )}
    </Link>
  );
}
