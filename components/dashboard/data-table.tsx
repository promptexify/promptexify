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
  IconEye,
  IconRefresh,
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

import { useAnalyticsTable } from "@/hooks/use-analytics";
import { getAllUsersActivityAction } from "@/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calendar } from "@/components/ui/icons";

// User activity schema for the user activity data
export const userActivitySchema = z.object({
  id: z.number(),
  userId: z.string(),
  name: z.string(),
  email: z.string(),
  role: z.string(),
  userType: z.string(),
  provider: z.string(),
  registeredOn: z.date(),
  posts: z.number(),
  lastLogin: z.date().nullable(),
  bookmarks: z.number(),
  favorites: z.number(),
});

// Analytics schema for the analytics tab
export const analyticsSchema = z.object({
  id: z.number(),
  page: z.string(),
  views: z.number(),
  percentage: z.number(),
});

// User activity columns
const userActivityColumns: ColumnDef<z.infer<typeof userActivitySchema>>[] = [
  {
    accessorKey: "name",
    header: "Name",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <div className="flex-1">
          <div className="font-medium">{row.original.name}</div>
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
      <Badge variant={row.original.role === "ADMIN" ? "default" : "secondary"}>
        {row.original.role}
      </Badge>
    ),
  },
  {
    accessorKey: "userType",
    header: "User Type",
    cell: ({ row }) => (
      <Badge
        variant={row.original.userType === "PREMIUM" ? "default" : "outline"}
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
];

// Analytics columns
const analyticsColumns: ColumnDef<z.infer<typeof analyticsSchema>>[] = [
  {
    accessorKey: "page",
    header: "Page",
    cell: ({ row }) => (
      <div className="flex items-center gap-2">
        <IconEye className="h-4 w-4 text-muted-foreground" />
        <code className="relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm">
          {row.original.page}
        </code>
      </div>
    ),
  },
  {
    accessorKey: "views",
    header: () => <div className="text-right">Views</div>,
    cell: ({ row }) => (
      <div className="text-right font-medium">
        {new Intl.NumberFormat("en-US").format(row.original.views)}
      </div>
    ),
  },
  {
    accessorKey: "percentage",
    header: () => <div className="text-right">% of Total</div>,
    cell: ({ row }) => (
      <div className="text-right">
        <Badge variant="secondary">{row.original.percentage.toFixed(1)}%</Badge>
      </div>
    ),
  },
];

export function DataTable() {
  const [rowSelection, setRowSelection] = React.useState({});
  const [columnVisibility, setColumnVisibility] =
    React.useState<VisibilityState>({});
  const [columnFilters, setColumnFilters] = React.useState<ColumnFiltersState>(
    []
  );
  const [sorting, setSorting] = React.useState<SortingState>([]);
  const [pagination, setPagination] = React.useState({
    pageIndex: 0,
    pageSize: 10,
  });
  const [activeTab, setActiveTab] = React.useState("user-activity");

  // User activity data state
  const [userActivityData, setUserActivityData] = React.useState<
    z.infer<typeof userActivitySchema>[]
  >([]);
  const [userActivityLoading, setUserActivityLoading] = React.useState(false);
  const [userActivityError, setUserActivityError] = React.useState<
    string | null
  >(null);

  // Fetch analytics data for the analytics tab
  const {
    topPages,
    totalVisitors,
    isLoading: analyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useAnalyticsTable({ range: "30d" });

  const isDevelopment = process.env.NODE_ENV !== "production";

  // Convert analytics data to table format
  const analyticsData = React.useMemo(() => {
    return topPages.map((page, index) => ({
      id: index + 1,
      page: page.page,
      views: page.views,
      percentage: totalVisitors > 0 ? (page.views / totalVisitors) * 100 : 0,
    }));
  }, [topPages, totalVisitors]);

  // Fetch user activity data
  const fetchUserActivity = React.useCallback(async () => {
    setUserActivityLoading(true);
    setUserActivityError(null);

    try {
      const result = await getAllUsersActivityAction();
      if (result.success) {
        setUserActivityData(result.users || []);
      } else {
        setUserActivityError(
          result.error || "Failed to load user activity data"
        );
      }
    } catch {
      setUserActivityError("Failed to load user activity data");
    } finally {
      setUserActivityLoading(false);
    }
  }, []);

  // Load user activity data when the tab is selected
  React.useEffect(() => {
    if (activeTab === "user-activity" && userActivityData.length === 0) {
      fetchUserActivity();
    }
  }, [activeTab, fetchUserActivity, userActivityData.length]);

  // User activity table
  const userActivityTable = useReactTable({
    data: userActivityData,
    columns: userActivityColumns,
    state: {
      sorting,
      columnVisibility,
      rowSelection,
      columnFilters,
      pagination,
    },
    getRowId: (row) => row.id.toString(),
    enableRowSelection: true,
    onRowSelectionChange: setRowSelection,
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

  // Analytics table
  const analyticsTable = useReactTable({
    data: analyticsData,
    columns: analyticsColumns,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    onSortingChange: setSorting,
    state: {
      sorting,
    },
  });

  return (
    <Tabs
      value={activeTab}
      onValueChange={setActiveTab}
      className="w-full flex-col justify-start gap-6"
    >
      <div className="flex items-center justify-between">
        <Label htmlFor="view-selector" className="sr-only">
          View
        </Label>
        <Select value={activeTab} onValueChange={setActiveTab}>
          <SelectTrigger
            className="flex w-fit @4xl/main:hidden"
            size="sm"
            id="view-selector"
          >
            <SelectValue placeholder="Select a view" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="user-activity">Users</SelectItem>
            <SelectItem value="analytics">Analytics</SelectItem>
          </SelectContent>
        </Select>
        <TabsList className="**:data-[slot=badge]:bg-muted-foreground/30 hidden **:data-[slot=badge]:size-5 **:data-[slot=badge]:rounded-full **:data-[slot=badge]:px-1 @4xl/main:flex">
          <TabsTrigger value="user-activity">Users</TabsTrigger>
          <TabsTrigger value="analytics">Analytics</TabsTrigger>
        </TabsList>
        <div className="flex items-center gap-2">
          {activeTab === "analytics" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetchAnalytics()}
              disabled={analyticsLoading}
            >
              <IconRefresh
                className={`h-4 w-4 ${analyticsLoading ? "animate-spin" : ""}`}
              />
              <span className="hidden lg:inline">Refresh Data</span>
              <span className="lg:hidden">Refresh</span>
            </Button>
          )}
          {activeTab === "user-activity" && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => fetchUserActivity()}
              disabled={userActivityLoading}
            >
              <IconRefresh
                className={`h-4 w-4 ${
                  userActivityLoading ? "animate-spin" : ""
                }`}
              />
              <span className="hidden lg:inline">Refresh Data</span>
              <span className="lg:hidden">Refresh</span>
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <IconLayoutColumns />
                <span className="hidden lg:inline">Customize Columns</span>
                <span className="lg:hidden">Columns</span>
                <IconChevronDown />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {(activeTab === "analytics" ? analyticsTable : userActivityTable)
                .getAllColumns()
                .filter(
                  (column) =>
                    typeof column.accessorFn !== "undefined" &&
                    column.getCanHide()
                )
                .map((column) => {
                  return (
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
                  );
                })}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* User Activity Tab */}
      <TabsContent
        value="user-activity"
        className="relative flex flex-col gap-4 overflow-auto"
      >
        {userActivityError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-destructive font-medium">
                  Error loading user activity data
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {userActivityError}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => fetchUserActivity()}
              >
                <IconRefresh className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold">User Activity</h3>
                <p className="text-sm text-muted-foreground">
                  Comprehensive user registration and activity data
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">{userActivityData.length}</p>
                <p className="text-xs text-muted-foreground">Total Users</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted">
                  {userActivityTable.getHeaderGroups().map((headerGroup) => (
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
                  {userActivityLoading ? (
                    // Loading skeleton
                    Array.from({ length: 5 }, (_, i) => (
                      <TableRow key={i}>
                        {Array.from({ length: 7 }, (_, colIndex) => (
                          <TableCell key={colIndex}>
                            <div className="h-4 w-24 animate-pulse bg-muted rounded" />
                          </TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : userActivityTable.getRowModel().rows?.length ? (
                    userActivityTable.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
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
                      <TableCell colSpan={7} className="h-24 text-center">
                        No user activity data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-muted-foreground hidden flex-1 text-sm lg:flex">
                {userActivityTable.getFilteredSelectedRowModel().rows.length} of{" "}
                {userActivityTable.getFilteredRowModel().rows.length} row(s)
                selected.
              </div>
              <div className="flex w-full items-center gap-8 lg:w-fit">
                <div className="hidden items-center gap-2 lg:flex">
                  <Label
                    htmlFor="rows-per-page"
                    className="text-sm font-medium"
                  >
                    Rows per page
                  </Label>
                  <Select
                    value={`${
                      userActivityTable.getState().pagination.pageSize
                    }`}
                    onValueChange={(value) => {
                      userActivityTable.setPageSize(Number(value));
                    }}
                  >
                    <SelectTrigger
                      size="sm"
                      className="w-20"
                      id="rows-per-page"
                    >
                      <SelectValue
                        placeholder={
                          userActivityTable.getState().pagination.pageSize
                        }
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
                  Page {userActivityTable.getState().pagination.pageIndex + 1}{" "}
                  of {userActivityTable.getPageCount()}
                </div>
                <div className="ml-auto flex items-center gap-2 lg:ml-0">
                  <Button
                    variant="outline"
                    className="hidden h-8 w-8 p-0 lg:flex"
                    onClick={() => userActivityTable.setPageIndex(0)}
                    disabled={!userActivityTable.getCanPreviousPage()}
                  >
                    <span className="sr-only">Go to first page</span>
                    <IconChevronsLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="size-8"
                    size="icon"
                    onClick={() => userActivityTable.previousPage()}
                    disabled={!userActivityTable.getCanPreviousPage()}
                  >
                    <span className="sr-only">Go to previous page</span>
                    <IconChevronLeft />
                  </Button>
                  <Button
                    variant="outline"
                    className="size-8"
                    size="icon"
                    onClick={() => userActivityTable.nextPage()}
                    disabled={!userActivityTable.getCanNextPage()}
                  >
                    <span className="sr-only">Go to next page</span>
                    <IconChevronRight />
                  </Button>
                  <Button
                    variant="outline"
                    className="hidden size-8 lg:flex"
                    size="icon"
                    onClick={() =>
                      userActivityTable.setPageIndex(
                        userActivityTable.getPageCount() - 1
                      )
                    }
                    disabled={!userActivityTable.getCanNextPage()}
                  >
                    <span className="sr-only">Go to last page</span>
                    <IconChevronsRight />
                  </Button>
                </div>
              </div>
            </div>
          </>
        )}
      </TabsContent>

      {/* Analytics Tab */}
      <TabsContent
        value="analytics"
        className="relative flex flex-col gap-4 overflow-auto"
      >
        {analyticsError ? (
          <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-destructive font-medium">
                  Error loading analytics data
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {analyticsError}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchAnalytics()}
              >
                <IconRefresh className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  Page Analytics
                  {isDevelopment && (
                    <Badge variant="secondary" className="text-xs">
                      DEV
                    </Badge>
                  )}
                </h3>
                <p className="text-sm text-muted-foreground">
                  Top performing pages by total views (last 30 days)
                  {isDevelopment && " (mock data)"}
                </p>
              </div>
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat("en-US").format(totalVisitors)}
                </p>
                <p className="text-xs text-muted-foreground">Total Visitors</p>
              </div>
            </div>

            <div className="overflow-hidden rounded-lg border">
              <Table>
                <TableHeader className="bg-muted">
                  {analyticsTable.getHeaderGroups().map((headerGroup) => (
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
                  {analyticsLoading ? (
                    // Loading skeleton
                    Array.from({ length: 5 }, (_, i) => (
                      <TableRow key={i}>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <div className="h-4 w-4 animate-pulse bg-muted rounded" />
                            <div className="h-4 w-32 animate-pulse bg-muted rounded" />
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-4 w-16 animate-pulse bg-muted rounded ml-auto" />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="h-4 w-12 animate-pulse bg-muted rounded ml-auto" />
                        </TableCell>
                      </TableRow>
                    ))
                  ) : analyticsTable.getRowModel().rows?.length ? (
                    analyticsTable.getRowModel().rows.map((row) => (
                      <TableRow key={row.id}>
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
                      <TableCell
                        colSpan={analyticsColumns.length}
                        className="h-24 text-center"
                      >
                        No analytics data available.
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </TabsContent>
    </Tabs>
  );
}
