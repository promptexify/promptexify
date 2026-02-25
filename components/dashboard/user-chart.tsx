"use client";

import * as React from "react";
import { Area, AreaChart, CartesianGrid, XAxis } from "recharts";

import { useIsMobile } from "@/hooks/use-mobile";
import { useAnalyticsChart } from "@/hooks/use-analytics";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  ChartConfig,
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
} from "@/components/ui/chart";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Badge } from "@/components/ui/badge";
import {
  IconTrendingUp,
  IconTrendingDown,
  IconRefresh,
} from "@/components/ui/icons";
import { Button } from "@/components/ui/button";

export const description =
  "An interactive area chart showing real analytics data";

const chartConfig = {
  visitors: {
    label: "Visitors",
  },
  desktop: {
    label: "Desktop",
    color: "var(--primary)",
  },
  mobile: {
    label: "Mobile",
    color: "var(--primary)",
  },
} satisfies ChartConfig;

export function ChartAreaInteractive() {
  const isMobile = useIsMobile();
  const [timeRange, setTimeRange] = React.useState<"7d" | "30d" | "90d">("30d");
  const isDevelopment = process.env.NODE_ENV !== "production";

  // Use the analytics hook to fetch real data
  const { chartData, totalVisitors, isLoading, error, refetch } =
    useAnalyticsChart({
      range: timeRange,
      refreshInterval: 5 * 60 * 1000, // Refresh every 5 minutes
    });

  React.useEffect(() => {
    if (isMobile && timeRange !== "7d") {
      setTimeRange("7d");
    }
  }, [isMobile, timeRange]);

  // Calculate growth percentage from chart data
  const calculateGrowthPercentage = () => {
    if (chartData.length < 2) return 0;

    const recentData = chartData.slice(-7); // Last 7 days
    const previousData = chartData.slice(-14, -7); // Previous 7 days

    if (previousData.length === 0) return 0;

    const recentTotal = recentData.reduce(
      (sum, item) => sum + item.visitors,
      0
    );
    const previousTotal = previousData.reduce(
      (sum, item) => sum + item.visitors,
      0
    );

    if (previousTotal === 0) return recentTotal > 0 ? 100 : 0;

    return (
      Math.round(((recentTotal - previousTotal) / previousTotal) * 100 * 100) /
      100
    );
  };

  const growthPercentage = calculateGrowthPercentage();
  const isGrowthPositive = growthPercentage >= 0;

  // Format number with commas
  const formatNumber = (num: number) => {
    return new Intl.NumberFormat("en-US").format(num);
  };

  // Show error state
  if (error && !isLoading) {
    return (
      <Card className="@container/card">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            Total Visitors
            <Button
              variant="outline"
              size="sm"
              onClick={() => refetch()}
              className="h-8 w-8 p-0"
            >
              <IconRefresh className="h-4 w-4" />
            </Button>
          </CardTitle>
          <CardDescription>Unable to load analytics data</CardDescription>
        </CardHeader>
        <CardContent className="flex items-center justify-center h-[250px]">
          <div className="text-center">
            <p className="text-destructive text-sm mb-2">Error: {error}</p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <IconRefresh className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="@container/card">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              Total Visitors
              {isLoading && (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
              )}
              {isDevelopment && (
                <Badge variant="secondary" className="text-xs">
                  DEV
                </Badge>
              )}
            </CardTitle>
            <CardDescription>
              <span className="hidden @[540px]/card:block">
                {formatNumber(totalVisitors)} unique visitors
                {isDevelopment && " (mock data)"}
              </span>
              <span className="@[540px]/card:hidden">
                {formatNumber(totalVisitors)} visitors
                {isDevelopment && " (mock)"}
              </span>
            </CardDescription>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => refetch()}
            className="h-8 w-8 p-0"
            disabled={isLoading}
          >
            <IconRefresh
              className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`}
            />
          </Button>
        </div>
        <CardAction>
          <div className="flex items-center gap-2">
            {chartData.length > 0 && (
              <Badge variant="outline" className="gap-1">
                {isGrowthPositive ? (
                  <IconTrendingUp className="h-3 w-3" />
                ) : (
                  <IconTrendingDown className="h-3 w-3" />
                )}
                {isGrowthPositive ? "+" : ""}
                {growthPercentage}%
              </Badge>
            )}
            <ToggleGroup
              type="single"
              value={timeRange}
              onValueChange={(value) =>
                value && setTimeRange(value as "7d" | "30d" | "90d")
              }
              variant="outline"
              className="hidden *:data-[slot=toggle-group-item]:!px-4 @[767px]/card:flex"
            >
              <ToggleGroupItem value="90d">Last 3 months</ToggleGroupItem>
              <ToggleGroupItem value="30d">Last 30 days</ToggleGroupItem>
              <ToggleGroupItem value="7d">Last 7 days</ToggleGroupItem>
            </ToggleGroup>
            <Select
              value={timeRange}
              onValueChange={(value) =>
                setTimeRange(value as "7d" | "30d" | "90d")
              }
            >
              <SelectTrigger className="w-[140px] @[767px]/card:hidden">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="90d">Last 3 months</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardAction>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig}>
          <AreaChart
            data={chartData}
            margin={{
              top: 5,
              right: 10,
              left: 10,
              bottom: 0,
            }}
          >
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-muted"
              horizontal
            />
            <XAxis
              dataKey="date"
              tickLine={false}
              axisLine={false}
              tickFormatter={(value) => {
                const date = new Date(value);
                return date.toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                });
              }}
              className="text-xs"
            />
            <ChartTooltip
              content={({ active, payload }) => {
                if (active && payload && payload.length) {
                  return (
                    <ChartTooltipContent
                      className="rounded-lg border bg-background p-2 shadow-sm"
                    >
                      <div className="grid grid-cols-2 gap-2">
                        <div className="flex flex-col">
                          <span className="text-[0.70rem] uppercase text-muted-foreground">
                            Desktop
                          </span>
                          <span className="font-bold text-muted-foreground">
                            {payload[0]?.value}
                          </span>
                        </div>
                        <div className="flex flex-col">
                          <span className="text-[0.70rem] uppercase text-muted-foreground">
                            Mobile
                          </span>
                          <span className="font-bold">
                            {payload[1]?.value}
                          </span>
                        </div>
                      </div>
                    </ChartTooltipContent>
                  );
                }
                return null;
              }}
            />
            <Area
              dataKey="desktop"
              fill="var(--primary)"
              className="fill-none stroke-primary"
              strokeWidth={2}
            />
            <Area
              dataKey="mobile"
              fill="var(--primary)"
              className="fill-none stroke-primary"
              strokeWidth={2}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
