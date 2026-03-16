"use client";

import * as React from "react";
import {
  IconChevronDown,
  IconChevronLeft,
  IconChevronRight,
  IconChevronsLeft,
  IconChevronsRight,
  IconCircleCheckFilled,
  IconLayoutColumns,
  IconLoader,
  IconRefresh,
  IconDotsVertical,
} from "@/components/ui/icons";
import {
  ColumnDef,
  ColumnFiltersState,
  flexRender,
  getCoreRowModel,
  getFacetedRowModel,
  getFacetedUniqueValues,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
  VisibilityState,
} from "@tanstack/react-table";
import { z } from "zod";
import { toast } from "sonner";

import {
  getAllUsersActivityAction,
  toggleUserDisabledAction,
  changeUserRoleAction,
} from "@/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Calendar } from "@/components/ui/icons";

export const userActivitySchema = z.object({
  id: z.number(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string().nullable(),
  userType: z.string().nullable(),
  provider: z.string(),
  disabled: z.boolean(),
  registeredOn: z.date(),
  posts: z.number(),
  lastLogin: z.date().nullable(),
  bookmarks: z.number(),
  favorites: z.number(),
});

type UserActivity = z.infer<typeof userActivitySchema>;

interface PendingAction {
  type: "disable" | "enable" | "changeRole";
  userId: string;
  userName: string;
  newRole?: "USER" | "ADMIN";
}

export function UsersTable() {
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });

  const [data, setData] = React.useState<UserActivity[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [pendingAction, setPendingAction] =
    React.useState<PendingAction | null>(null);
  const [isActioning, setIsActioning] = React.useState(false);

  const fetchUsers = React.useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await getAllUsersActivityAction();
      if (result.success) {
        setData(result.users || []);
      } else {
        setError(result.error || "Failed to load users");
      }
    } catch {
      setError("Failed to load users");
    } finally {
      setIsLoading(false);
    }
  }, []);

  React.useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleConfirmAction = React.useCallback(async () => {
    if (!pendingAction) return;
    setIsActioning(true);

    try {
      if (pendingAction.type === "disable" || pendingAction.type === "enable") {
        const result = await toggleUserDisabledAction(pendingAction.userId);
        if (result.success) {
          toast.success(result.message);
          setData((prev) =>
            prev.map((u) =>
              u.userId === pendingAction.userId
                ? { ...u, disabled: result.disabled ?? !u.disabled }
                : u
            )
          );
        } else {
          toast.error(result.error);
        }
      } else if (pendingAction.type === "changeRole" && pendingAction.newRole) {
        const result = await changeUserRoleAction(
          pendingAction.userId,
          pendingAction.newRole
        );
        if (result.success) {
          toast.success(result.message);
          setData((prev) =>
            prev.map((u) =>
              u.userId === pendingAction.userId
                ? { ...u, role: result.role ?? u.role }
                : u
            )
          );
        } else {
          toast.error(result.error);
        }
      }
    } catch {
      toast.error("An unexpected error occurred");
    } finally {
      setIsActioning(false);
      setPendingAction(null);
    }
  }, [pendingAction]);

  const columns: ColumnDef<UserActivity>[] = React.useMemo(
    () => [
      {
        accessorKey: "name",
        header: "Name",
        cell: ({ row }) => (
          <div className="flex items-center gap-2">
            <div className="flex-1">
              <div className="font-medium flex items-center gap-2">
                {row.original.name}
                {row.original.disabled && (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                    Disabled
                  </Badge>
                )}
              </div>
              <div className="text-sm text-muted-foreground">
                {row.original.email}
              </div>
            </div>
          </div>
        ),
      },
      {
        accessorKey: "role",
        header: "Role",
        cell: ({ row }) => (
          <Badge
            variant={row.original.role === "ADMIN" ? "default" : "secondary"}
          >
            {row.original.role}
          </Badge>
        ),
      },
      {
        accessorKey: "userType",
        header: "User Type",
        cell: ({ row }) => (
          <Badge
            variant={
              row.original.userType === "PREMIUM" ? "default" : "outline"
            }
          >
            {row.original.userType}
          </Badge>
        ),
      },
      {
        accessorKey: "provider",
        header: "Provider",
        cell: ({ row }) => (
          <div className="flex items-center gap-1">
            {row.original.provider === "GOOGLE" ? (
              <IconCircleCheckFilled className="h-4 w-4 fill-green-500 dark:fill-green-400" />
            ) : (
              <IconLoader className="h-4 w-4" />
            )}
            <span className="text-sm">{row.original.provider}</span>
          </div>
        ),
      },
      {
        accessorKey: "registeredOn",
        header: "Registered On",
        cell: ({ row }) => (
          <div className="text-sm">
            {new Intl.DateTimeFormat("en-US", {
              year: "numeric",
              month: "short",
              day: "numeric",
            }).format(new Date(row.original.registeredOn))}
          </div>
        ),
      },
      {
        accessorKey: "posts",
        header: () => <div className="text-right">Posts</div>,
        cell: ({ row }) => (
          <div className="text-right font-medium">{row.original.posts}</div>
        ),
      },
      {
        accessorKey: "lastLogin",
        header: "Last Login",
        cell: ({ row }) => (
          <div className="text-sm text-muted-foreground flex items-center gap-1">
            <Calendar className="h-3 w-3" />
            {row.original.lastLogin
              ? new Date(row.original.lastLogin).toLocaleString()
              : ""}
          </div>
        ),
      },
      {
        id: "actions",
        header: () => <div className="text-right">Actions</div>,
        cell: ({ row }) => {
          const user = row.original;
          return (
            <div className="text-right">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="icon" className="h-8 w-8">
                    <IconDotsVertical className="h-4 w-4" />
                    <span className="sr-only">Open menu</span>
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuLabel>Manage User</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() =>
                      setPendingAction({
                        type: user.disabled ? "enable" : "disable",
                        userId: user.userId,
                        userName: user.name,
                      })
                    }
                  >
                    {user.disabled ? "Enable User" : "Disable User"}
                  </DropdownMenuItem>
                  {user.role === "USER" && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={() =>
                          setPendingAction({
                            type: "changeRole",
                            userId: user.userId,
                            userName: user.name,
                            newRole: "ADMIN",
                          })
                        }
                      >
                        Promote to Admin
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          );
        },
      },
    ],
    []
  );

  const table = useReactTable({
    data,
    columns,
    state: {
      sorting,
      columnVisibility,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id.toString(),
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onColumnVisibilityChange: setColumnVisibility,
    onPaginationChange: setPagination,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFacetedRowModel: getFacetedRowModel(),
    getFacetedUniqueValues: getFacetedUniqueValues(),
  });

  const dialogTitle = React.useMemo(() => {
    if (!pendingAction) return "";
    if (pendingAction.type === "disable") return "Disable User";
    if (pendingAction.type === "enable") return "Enable User";
    if (pendingAction.newRole === "ADMIN") return "Promote to Admin";
    return "Demote to User";
  }, [pendingAction]);

  const dialogDescription = React.useMemo(() => {
    if (!pendingAction) return "";
    if (pendingAction.type === "disable") {
      return `Are you sure you want to disable "${pendingAction.userName}"? They will no longer be able to access the platform.`;
    }
    if (pendingAction.type === "enable") {
      return `Are you sure you want to enable "${pendingAction.userName}"? They will regain access to the platform.`;
    }
    if (pendingAction.newRole === "ADMIN") {
      return `Are you sure you want to promote "${pendingAction.userName}" to Admin? They will gain full administrative privileges.`;
    }
    return `Are you sure you want to demote "${pendingAction.userName}" to User? They will lose administrative privileges.`;
  }, [pendingAction]);

  return (
    <>
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">User Management</h3>
          <p className="text-sm text-muted-foreground">
            Manage users, roles, and account status
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right mr-4">
            <p className="text-2xl font-bold">{data.length}</p>
            <p className="text-xs text-muted-foreground">Total Users</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => fetchUsers()}
            disabled={isLoading}
          >
            <IconRefresh
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
            <span className="hidden lg:inline">Refresh</span>
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Columns</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {table
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {error ? (
        <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-destructive font-medium">
                Error loading users
              </p>
              <p className="text-xs text-muted-foreground mt-1">{error}</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => fetchUsers()}>
              <IconRefresh className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-lg border">
            <Table>
              <TableHeader className="bg-muted">
                {table.getHeaderGroups().map((headerGroup) => (
                  <TableRow key={headerGroup.id}>
                    {headerGroup.headers.map((header) => (
                      <TableHead key={header.id} colSpan={header.colSpan}>
                        {header.isPlaceholder
                          ? null
                          : flexRender(
                              header.column.columnDef.header,
                              header.getContext()
                            )}
                      </TableHead>
                    ))}
                  </TableRow>
                ))}
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  Array.from({ length: 5 }, (_, i) => (
                    <TableRow key={i}>
                      {Array.from({ length: 8 }, (_, colIndex) => (
                        <TableCell key={colIndex}>
                          <div className="h-4 w-24 animate-pulse bg-muted rounded" />
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : table.getRowModel().rows?.length ? (
                  table.getRowModel().rows.map((row) => (
                    <TableRow
                      key={row.id}
                      className={
                        row.original.disabled ? "opacity-60" : undefined
                      }
                    >
                      {row.getVisibleCells().map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(
                            cell.column.columnDef.cell,
                            cell.getContext()
                          )}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                ) : (
                  <TableRow>
                    <TableCell colSpan={8} className="h-24 text-center">
                      No users found.
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex items-center justify-between">
            <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
              {table.getFilteredRowModel().rows.length} user(s) total
            </div>
            <div className="flex w-full items-center gap-8 lg:w-fit">
              <div className="hidden items-center gap-2 lg:flex">
                <Label
                  htmlFor="users-rows-per-page"
                  className="text-sm font-medium"
                >
                  Rows per page
                </Label>
                <Select
                  value={`${table.getState().pagination.pageSize}`}
                  onValueChange={(value) => {
                    table.setPageSize(Number(value));
                  }}
                >
                  <SelectTrigger
                    size="sm"
                    className="w-20"
                    id="users-rows-per-page"
                  >
                    <SelectValue
                      placeholder={table.getState().pagination.pageSize}
                    />
                  </SelectTrigger>
                  <SelectContent side="top">
                    {[10, 20, 30, 40, 50].map((pageSize) => (
                      <SelectItem key={pageSize} value={`${pageSize}`}>
                        {pageSize}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex w-fit items-center justify-center text-sm font-medium">
                Page {table.getState().pagination.pageIndex + 1} of{" "}
                {table.getPageCount()}
              </div>
              <div className="ml-auto flex items-center gap-2 lg:ml-0">
                <Button
                  variant="outline"
                  className="hidden h-8 w-8 p-0 lg:flex"
                  onClick={() => table.setPageIndex(0)}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">Go to first page</span>
                  <IconChevronsLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8"
                  size="icon"
                  onClick={() => table.previousPage()}
                  disabled={!table.getCanPreviousPage()}
                >
                  <span className="sr-only">Go to previous page</span>
                  <IconChevronLeft />
                </Button>
                <Button
                  variant="outline"
                  className="size-8"
                  size="icon"
                  onClick={() => table.nextPage()}
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Go to next page</span>
                  <IconChevronRight />
                </Button>
                <Button
                  variant="outline"
                  className="hidden size-8 lg:flex"
                  size="icon"
                  onClick={() =>
                    table.setPageIndex(table.getPageCount() - 1)
                  }
                  disabled={!table.getCanNextPage()}
                >
                  <span className="sr-only">Go to last page</span>
                  <IconChevronsRight />
                </Button>
              </div>
            </div>
          </div>
        </>
      )}

      <AlertDialog
        open={!!pendingAction}
        onOpenChange={(open) => {
          if (!open) setPendingAction(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>{dialogDescription}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isActioning}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              disabled={isActioning}
              className={
                pendingAction?.type === "disable"
                  ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                  : undefined
              }
            >
              {isActioning ? "Processing..." : "Confirm"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
