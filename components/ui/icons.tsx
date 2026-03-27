import {
  Loader2,
  Crown,
  Upload,
  HelpCircle,
  Search,
  ArrowRight,
  User,
  Zap,
  Settings,
  Clock,
  Calendar,
  Command,
} from "lucide-react";

// Tabler Icons
import {
  IconDashboard,
  IconHelp,
  IconSearch,
  IconSettings,
  IconEdit,
  IconTags,
  IconCategory,
  IconBookmark,
  IconStar,
  IconHeart,
  IconRobot,
  IconFile,
  IconExternalLink,
  IconTrendingUp,
  IconTrendingDown,
  IconRefresh,
  IconEye,
  IconDots,
  IconCreditCard,
  IconDotsVertical,
  IconNotification,
  IconUserCircle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconLayoutColumns,
  IconLoader,
  IconCrown,
  IconX,
  IconFileText,
  IconNews,
} from "@tabler/icons-react";

// Re-export Tabler icons individually so callers can `import { IconExternalLink } from "@/components/ui/icons"` without touching the Tabler package.
export {
  IconDashboard,
  IconHelp,
  IconSearch,
  IconSettings,
  IconEdit,
  IconTags,
  IconCategory,
  IconBookmark,
  IconStar,
  IconHeart,
  IconRobot,
  IconFile,
  IconExternalLink,
  IconTrendingUp,
  IconTrendingDown,
  IconRefresh,
  IconEye,
  IconDots,
  IconCreditCard,
  IconDotsVertical,
  IconNotification,
  IconUserCircle,
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconLayoutColumns,
  IconLoader,
  IconCrown,
  IconX,
  IconFileText,
  IconNews,
};

export type { Icon } from "@tabler/icons-react";
// Re-export everything from lucide-react so callers can import any lucide icon from this file
export * from "lucide-react";

export const Icons = {
  spinner: Loader2,
  crown: Crown,
  upload: Upload,
  helpCircle: HelpCircle,
  search: Search,
  arrowRight: ArrowRight,
  user: User,
  zap: Zap,
  settings: Settings,
  clock: Clock,
  calendar: Calendar,
  command: Command,
  google: (props: React.SVGProps<SVGSVGElement>) => (
    <svg viewBox="0 0 24 24" {...props}>
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  ),
};
