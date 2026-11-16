import type { ComponentType, SVGAttributes } from "react";
import {
  AddCircleRegular,
  AddRegular,
  AirplaneRegular,
  AlertOffRegular,
  AlertUrgentRegular,
  ArchiveArrowBackRegular,
  ArrowCounterclockwiseRegular,
  ArrowDownloadRegular,
  ArrowRepeatAllRegular,
  ArrowUndoRegular,
  BoardRegular,
  BookOpenRegular,
  BriefcaseRegular,
  CalendarClockRegular,
  CalendarLtrRegular,
  CalendarMonthRegular,
  CartRegular,
  CheckmarkRegular,
  ChevronDownRegular,
  ChevronLeftRegular,
  ChevronRightRegular,
  ChevronUpRegular,
  DeleteRegular,
  DismissRegular,
  DumbbellRegular,
  FireRegular,
  FlagFilled,
  FlagRegular,
  FolderOpenRegular,
  GiftRegular,
  HatGraduationRegular,
  HeartRegular,
  HomeRegular,
  InfoRegular,
  LeafOneRegular,
  LockClosedRegular,
  LockOpenRegular,
  MailInboxRegular,
  MoreHorizontalRegular,
  NextRegular,
  PanelLeftContractRegular,
  PanelLeftExpandRegular,
  PanelRightContractRegular,
  PanelRightExpandRegular,
  PauseRegular,
  PictureInPictureRegular,
  PlayRegular,
  ReOrderDotsVerticalRegular,
  SearchRegular,
  SettingsRegular,
  StarRegular,
  SubtractRegular,
  TaskListLtrRegular,
  TextBulletListLtrRegular,
  TimerRegular,
  WindowRegular,
} from "@fluentui/react-icons";
import type { ListIcon, SmartId } from "./types";

/**
 * Every icon in the app: Microsoft's Fluent UI System Icons (MIT), sized in pixels with `size`.
 * Components import icons from here, never from the icon package, so the set stays in one place.
 */
export interface IconProps extends SVGAttributes<SVGElement> {
  size?: number;
}
export type Icon = ComponentType<IconProps>;

function sized(Fluent: ComponentType<SVGAttributes<SVGElement>>): Icon {
  return function SizedIcon({ size = 16, ...rest }: IconProps) {
    return <Fluent aria-hidden fontSize={size} {...rest} />;
  };
}

export const Add = sized(AddRegular);
export const AddCircle = sized(AddCircleRegular);
export const AlertOff = sized(AlertOffRegular);
export const AlertUrgent = sized(AlertUrgentRegular);
export const Board = sized(BoardRegular);
export const BookOpen = sized(BookOpenRegular);
export const Checkmark = sized(CheckmarkRegular);
export const ChevronDown = sized(ChevronDownRegular);
export const ChevronLeft = sized(ChevronLeftRegular);
export const ChevronRight = sized(ChevronRightRegular);
export const ChevronUp = sized(ChevronUpRegular);
export const Delete = sized(DeleteRegular);
export const Dismiss = sized(DismissRegular);
export const Download = sized(ArrowDownloadRegular);
export const Fire = sized(FireRegular);
export const Flag = sized(FlagRegular);
export const FlagOn = sized(FlagFilled);
export const FloatingList = sized(PictureInPictureRegular);
export const FolderOpen = sized(FolderOpenRegular);
export const Grip = sized(ReOrderDotsVerticalRegular);
export const Info = sized(InfoRegular);
export const ListLayout = sized(TextBulletListLtrRegular);
export const LockClosed = sized(LockClosedRegular);
export const LockOpen = sized(LockOpenRegular);
export const More = sized(MoreHorizontalRegular);
export const PanelClose = sized(PanelRightContractRegular);
export const PanelOpen = sized(PanelRightExpandRegular);
export const SidebarCollapse = sized(PanelLeftContractRegular);
export const SidebarExpand = sized(PanelLeftExpandRegular);
export const Pause = sized(PauseRegular);
export const Play = sized(PlayRegular);
export const Repeat = sized(ArrowRepeatAllRegular);
export const Reset = sized(ArrowCounterclockwiseRegular);
export const Restore = sized(ArchiveArrowBackRegular);
export const Search = sized(SearchRegular);
export const Settings = sized(SettingsRegular);
export const Skip = sized(NextRegular);
export const Subtasks = sized(TaskListLtrRegular);
export const Subtract = sized(SubtractRegular);
export const Timer = sized(TimerRegular);
export const Undo = sized(ArrowUndoRegular);
export const Window = sized(WindowRegular);

export const LIST_ICON_COMPONENTS: Record<ListIcon, Icon> = {
  list: ListLayout,
  star: sized(StarRegular),
  heart: sized(HeartRegular),
  home: sized(HomeRegular),
  work: sized(BriefcaseRegular),
  cart: sized(CartRegular),
  book: BookOpen,
  plane: sized(AirplaneRegular),
  leaf: sized(LeafOneRegular),
  fitness: sized(DumbbellRegular),
  gift: sized(GiftRegular),
  school: sized(HatGraduationRegular),
};

export const SMART_ICONS: Record<SmartId, Icon> = {
  today: sized(CalendarLtrRegular),
  scheduled: sized(CalendarClockRegular),
  all: sized(MailInboxRegular),
  flagged: Flag,
  completed: Checkmark,
  calendar: sized(CalendarMonthRegular),
};

export function ListBadge({ icon, color, size = 28 }: { icon: ListIcon; color: string; size?: number }) {
  const Icon = LIST_ICON_COMPONENTS[icon];
  return (
    <span className="list-badge" style={{ width: size, height: size, background: `var(--c-${color})` }}>
      <Icon size={size * 0.6} />
    </span>
  );
}
