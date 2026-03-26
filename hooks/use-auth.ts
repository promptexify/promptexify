"use client";

import { useEffect, useState, useRef } from "react";
import { createClient } from "@/lib/supabase/client";
import { User } from "@supabase/supabase-js";

interface UserData {
  id: string;
  email: string;
  name: string;
  avatar?: string | null;
  role: "USER" | "ADMIN" | null;
  type: "FREE" | "PREMIUM" | null;
  oauth: "GOOGLE" | "EMAIL";
  createdAt: Date;
  updatedAt: Date;
}

interface ExtendedUser extends User {
  userData?: UserData | null;
}

export interface AuthState {
  user: ExtendedUser | null;
  loading: boolean;
}

// Global cache to prevent multiple API calls across components
const userDataCache = {
  data: null as UserData | null,
  promise: null as Promise<UserData | null> | null,
  timestamp: 0,
  CACHE_DURATION: 5 * 60 * 1000, // 5 minutes
};

// Function to fetch user data with caching
const fetchUserData = async (): Promise<UserData | null> => {
  const now = Date.now();

  // Return cached data if it's still fresh
  if (
    userDataCache.data &&
    now - userDataCache.timestamp < userDataCache.CACHE_DURATION
  ) {
    return userDataCache.data;
  }

  // If there's already a request in progress, return that promise
  if (userDataCache.promise) {
    return userDataCache.promise;
  }

  // Create new request
  userDataCache.promise = (async () => {
    try {
      // console.log("🔄 Fetching user profile data...");
      const response = await fetch("/api/v1/user/profile");
      if (response.ok) {
        const userData = await response.json();
        userDataCache.data = userData;
        userDataCache.timestamp = now;
        // console.log("✅ User profile data cached");
        return userData;
      } else {
        // Don't cache failed responses
        userDataCache.data = null;
        userDataCache.timestamp = 0;
        return null;
      }
    } catch (error) {
      console.error("Error fetching user data:", error);
      userDataCache.data = null;
      userDataCache.timestamp = 0;
      return null;
    } finally {
      // Clear the promise so new requests can be made
      userDataCache.promise = null;
    }
  })();

  return userDataCache.promise;
};

// Function to clear cache (useful for logout or profile updates)
export const clearUserDataCache = () => {
  userDataCache.data = null;
  userDataCache.promise = null;
  userDataCache.timestamp = 0;
};

export function useAuth(): AuthState {
  const [user, setUser] = useState<ExtendedUser | null>(null);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();
  const initializationRef = useRef(false);

  useEffect(() => {
    // Prevent multiple initializations
    if (initializationRef.current) return;
    initializationRef.current = true;

    const getUser = async () => {
      try {
        // console.log("🔍 Checking auth session...");
        // More robust check using getSession
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const supabaseUser = session.user;
          // Use cached fetch function
          const userData = await fetchUserData();
          setUser({
            ...supabaseUser,
            userData,
          });
        } else {
          setUser(null);
          clearUserDataCache(); // Clear cache when user logs out
        }
      } catch (error) {
        console.error("Error fetching user:", error);
        setUser(null);
      } finally {
        setLoading(false);
      }
    };

    getUser();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      // console.log("🔄 Auth state changed:", event);

      if (session?.user) {
        try {
          // Use cached fetch function
          const userData = await fetchUserData();
          setUser({
            ...session.user,
            userData,
          });
        } catch (error) {
          console.error("Error fetching user data:", error);
          setUser(session.user);
        }
      } else {
        setUser(null);
        clearUserDataCache(); // Clear cache when user logs out
      }
      setLoading(false);
    });

    return () => {
      subscription.unsubscribe();
      initializationRef.current = false;
    };
  }, [supabase.auth]);

  return { user, loading };
}
