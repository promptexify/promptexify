"use client";

import { useState, useEffect, useCallback } from "react";

// Interface matching the API response
interface AnalyticsData {
  chartData: Array<{
    date: string;
    desktop: number;
    mobile: number;
    total: number;
  }>;

  totalVisitors: number;
  topPages: Array<{
    page: string;
    views: number;
  }>;
  topReferrers: Array<{
    referrer: string;
    views: number;
  }>;
}

interface UseAnalyticsOptions {
  range?: "7d" | "30d" | "90d";
  timezone?: string;
  refreshInterval?: number;
}

interface UseAnalyticsReturn {
  data: AnalyticsData | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
}

// Generate mock data for development
function generateMockData(range: string): AnalyticsData {
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  const chartData = [];
  let totalVisitors = 0;

  // Optimize for smaller data structures
  const maxDataPoints = Math.min(days, 30); // Limit to 30 days max for mock data
  const stepSize = Math.ceil(days / maxDataPoints);

  // Generate data for the specified range with optimization
  for (let i = maxDataPoints - 1; i >= 0; i--) {
    const date = new Date();
    date.setDate(date.getDate() - i * stepSize);

    // Generate realistic-looking data with some randomness
    const baseViews = Math.floor(Math.random() * 500) + 100;
    const desktop = Math.floor(baseViews * (0.5 + Math.random() * 0.3)); // 50-80% desktop
    const mobile = baseViews - desktop;
    const visitors = Math.floor(baseViews * (0.6 + Math.random() * 0.2)); // 60-80% of views

    totalVisitors += visitors;

    chartData.push({
      date: date.toISOString().split("T")[0],
      desktop,
      mobile,
      total: baseViews,
    });
  }

  // Use smaller, more efficient data structures
  const topPages = [
    { page: "/", views: Math.floor(totalVisitors * 0.3) },
    { page: "/directory", views: Math.floor(totalVisitors * 0.2) },
    { page: "/entry/prompts", views: Math.floor(totalVisitors * 0.15) },
    { page: "/pricing", views: Math.floor(totalVisitors * 0.1) },
    { page: "/about", views: Math.floor(totalVisitors * 0.05) },
  ];

  const topReferrers = [
    { referrer: "google.com", views: Math.floor(totalVisitors * 0.4) },
    { referrer: "direct", views: Math.floor(totalVisitors * 0.2) },
    { referrer: "twitter.com", views: Math.floor(totalVisitors * 0.15) },
    { referrer: "github.com", views: Math.floor(totalVisitors * 0.1) },
    { referrer: "reddit.com", views: Math.floor(totalVisitors * 0.05) },
  ];

  return {
    chartData,
    totalVisitors,
    topPages,
    topReferrers,
  };
}

export function useAnalytics({
  range = "7d",
  timezone = "UTC",
  refreshInterval,
}: UseAnalyticsOptions = {}): UseAnalyticsReturn {
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Check if we're in production
      const isProduction = process.env.NODE_ENV === "production";

      // In development, return mock data immediately
      if (!isProduction) {
        console.log("Development mode: Using mock analytics data");
        const mockData = generateMockData(range);
        setData(mockData);
        return;
      }

      // Production: Fetch from API
      const params = new URLSearchParams({
        range,
        timezone,
      });

      const response = await fetch(`/api/analytics?${params}`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(
          errorData.error || `HTTP error! status: ${response.status}`
        );
      }

      const analyticsData = await response.json();
      setData(analyticsData);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown error occurred";
      setError(errorMessage);
      console.error("Error fetching analytics data:", err);
    } finally {
      setIsLoading(false);
    }
  }, [range, timezone]);

  const refetch = async () => {
    await fetchAnalytics();
  };

  // Initial data fetch
  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

  // Set up automatic refresh if specified (only in production)
  useEffect(() => {
    if (!refreshInterval || process.env.NODE_ENV !== "production") return;

    const interval = setInterval(fetchAnalytics, refreshInterval);
    return () => clearInterval(interval);
  }, [fetchAnalytics, refreshInterval]);

  return {
    data,
    isLoading,
    error,
    refetch,
  };
}

// Helper hook for chart data specifically
export function useAnalyticsChart(options?: UseAnalyticsOptions) {
  const { data, isLoading, error, refetch } = useAnalytics(options);

  // Transform data to match chart requirements
  const chartData =
    data?.chartData?.map((item) => ({
      date: item.date,
      desktop: item.desktop,
      mobile: item.mobile,
      visitors: item.desktop + item.mobile, // Total for backward compatibility
    })) || [];

  return {
    chartData,
    totalVisitors: data?.totalVisitors || 0,
    isLoading,
    error,
    refetch,
  };
}

// Helper hook for table data specifically
export function useAnalyticsTable(options?: UseAnalyticsOptions) {
  const { data, isLoading, error, refetch } = useAnalytics(options);

  // Transform data for table display
  const tableData =
    data?.topPages?.map((page, index) => ({
      id: index + 1,
      header: page.page,
      type: "Page",
      status: "Active",
      target: page.views.toString(),
      limit: "∞",
      reviewer: "System",
    })) || [];

  return {
    tableData,
    topPages: data?.topPages || [],
    topReferrers: data?.topReferrers || [],
    totalVisitors: data?.totalVisitors || 0,
    isLoading,
    error,
    refetch,
  };
}
