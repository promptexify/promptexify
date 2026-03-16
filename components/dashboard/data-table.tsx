"use client";

import * as React from "react";
import {
  IconEye,
  IconRefresh,
} from "@/components/ui/icons";
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { z } from "zod";

import { useAnalyticsTable } from "@/hooks/use-analytics";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const analyticsSchema = z.object({
  id: z.number(),
  page: z.string(),
  views: z.number(),
  percentage: z.number(),
});

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
  const [sorting, setSorting] = React.useState<SortingState>([]);

  const {
    topPages,
    totalVisitors,
    isLoading: analyticsLoading,
    error: analyticsError,
    refetch: refetchAnalytics,
  } = useAnalyticsTable({ range: "30d" });

  const isDevelopment = process.env.NODE_ENV !== "production";

  const analyticsData = React.useMemo(() => {
    return topPages.map((page, index) => ({
      id: index + 1,
      page: page.page,
      views: page.views,
      percentage: totalVisitors > 0 ? (page.views / totalVisitors) * 100 : 0,
    }));
  }, [topPages, totalVisitors]);

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
    <div className="flex flex-col gap-4">
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
            <div className="flex items-center gap-4">
              <div className="text-right">
                <p className="text-2xl font-bold">
                  {new Intl.NumberFormat("en-US").format(totalVisitors)}
                </p>
                <p className="text-xs text-muted-foreground">Total Visitors</p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchAnalytics()}
                disabled={analyticsLoading}
              >
                <IconRefresh
                  className={`h-4 w-4 ${analyticsLoading ? "animate-spin" : ""}`}
                />
                <span className="hidden lg:inline">Refresh</span>
              </Button>
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
    </div>
  );
}
