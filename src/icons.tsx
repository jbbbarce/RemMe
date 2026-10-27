import {
  BookOpen,
  Briefcase,
  Calendar,
  CalendarClock,
  Check,
  Dumbbell,
  Flag,
  Gift,
  GraduationCap,
  Heart,
  House,
  Inbox,
  Leaf,
  List,
  Plane,
  ShoppingCart,
  Star,
  type LucideIcon,
} from "lucide-react";
import type { ListIcon, SmartId } from "./types";

export const LIST_ICON_COMPONENTS: Record<ListIcon, LucideIcon> = {
  list: List,
  star: Star,
  heart: Heart,
  home: House,
  work: Briefcase,
  cart: ShoppingCart,
  book: BookOpen,
  plane: Plane,
  leaf: Leaf,
  fitness: Dumbbell,
  gift: Gift,
  school: GraduationCap,
};

export const SMART_ICONS: Record<SmartId, LucideIcon> = {
  today: Calendar,
  scheduled: CalendarClock,
  all: Inbox,
  flagged: Flag,
  completed: Check,
};

export function ListBadge({ icon, color, size = 28 }: { icon: ListIcon; color: string; size?: number }) {
  const Icon = LIST_ICON_COMPONENTS[icon];
  return (
    <span className="list-badge" style={{ width: size, height: size, background: `var(--c-${color})` }}>
      <Icon size={size * 0.55} strokeWidth={2.4} />
    </span>
  );
}
