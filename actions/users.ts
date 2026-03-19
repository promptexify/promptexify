"use server";

import { db } from "@/lib/db";
import {
  users,
  stars,
  posts,
  categories,
  tags,
} from "@/lib/db/schema";
import { eq, and, desc, gte, lt, sql, inArray, aliasedTable } from "drizzle-orm";
import { requireAuth, getCurrentUser } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { withCSRFProtection, handleSecureActionError } from "@/lib/security/csp";
import { updateUserProfileSchema } from "@/lib/schemas";
import { sanitizeInput } from "@/lib/security/sanitize";

export const updateUserProfileAction = withCSRFProtection(
  async (formData: FormData) => {
    try {
      // Require authentication
      const user = await requireAuth();

      // Extract form data
      const rawName = formData.get("name") as string;

      // SECURITY: Pre-sanitize input before validation
      const sanitizedName = rawName ? sanitizeInput(rawName) : "";

      // Validate input using centralized schema
      const validationResult = updateUserProfileSchema.safeParse({
        name: sanitizedName,
      });

      if (!validationResult.success) {
        // Log validation failure for security monitoring
        console.warn(
          `[SECURITY] Profile update validation failed for user ${user.id}:`,
          validationResult.error.errors
        );

        return {
          success: false,
          error:
            validationResult.error.errors[0]?.message || "Invalid input format",
        };
      }

      const { name } = validationResult.data;

      // SECURITY: Additional server-side validation
      if (!name || name.trim().length < 2) {
        return {
          success: false,
          error: "Name must be at least 2 characters long",
        };
      }

      // SECURITY: Check for suspicious patterns
      const suspiciousPatterns = [
        /^[aA\s]+$/, // All A's and spaces
        /^[zZ\s]+$/, // All Z's and spaces
        // Expanded list of reserved/brand/role/spam/scam names and common suspicious names
        /\b(admin|test|user|null|undefined|script|root|guest|supervisor|editor|google|facebook|instagram|twitter|youtube|telegram|whatsapp|microsoft|apple|amazon|ebay|paypal|visa|mastercard|amex|discover|bank|account|security|support|official|system|developer|webmaster|noreply|daemon|anonymous|anon|temp|spam|junk|fake|bot|robot|phish|scam|fraud|malware|virus|hack|cracker|exploit|banned|blocked|restricted|error|failure|delete|remove|cancel|void|invalid|licen(s|c)e|premium|pro|vip|gold|silver|bronze|free|discount|sale|offer|deal|promo|coupon|winner|prize|lucky|congratulations|claim|collect|verify|urgent|alert|warning|important|action|required|immediately|now|click|link|download|install|update|upgrade|subscribe|unsubscribe|register|login|signup|password|otp|code|pin|secret|private|confidential|billing|invoice|payment|refund|chargeback|dispute|legal|policy|terms|conditions|agreement|copyright|trademark|patent|brand|company|corporation|inc|ltd|llc|gmbh|co|org|net|com|info|biz|site|website|forum|blog|shop|store|online|service|solution|portal|dashboard|management|control|console|panel|bitcoin|crypto|forex|invest|profit|dividend|cash|money|banker|trader|loan|credit|debt|mortgage|finance|wealth|fortune|response|reply|confirm|open|report|abuse|compromise|breach|server|client|network|database|placeholder|default|unknown|qwert|asdfg)\b/i,
        /^(.)\1{4,}$/, // 5+ repeated characters in a row (e.g., "aaaaa")
        /^\s+$|^$|^\s*$/, // Only spaces or empty
        /\s{4,}/, // 4+ consecutive spaces
        /(\d)\1{4,}/, // 5+ repeated digits (e.g., "11111")
        /([^a-zA-Z\d\s])\1{4,}/, // 5+ repeated non-alphanumeric characters (e.g., "#####")
        /\b[A-Z]{5,}\d{3,}\b/, // e.g., USER12345
        /\b\d{6,}\b/, // e.g., 123456789
        // Offensive/bad words (expand as needed) - be cautious with this list for names
        /\b(fuck|suck|shit|bitch|asshole|damn|cunt|dick|bastard|slut|whore|motherfucker|pussy|nigger|faggot|retard|idiot|moron|stupid|loser|wanker|chink|gook|kyke|spic|terrorist|jihad|bomb|kill|murder|rape|pedophile|porn|sex|erotic|naked| XXX | hentai| boob|ass|tits|vagina|penis)\b/i,
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(name)) {
          console.warn(
            `[SECURITY] Suspicious name pattern detected: ${name} for user ${user.id}`
          );

          // Log suspicious activity
          const { SecurityAlert } = await import("@/lib/security/monitor");
          await SecurityAlert.suspiciousRequest(
            "Suspicious name pattern in profile update",
            { name, pattern: pattern.toString() },
            user.id
          );

          return {
            success: false,
            error:
              "Invalid name format. Please use a real name with letters and spaces only.",
          };
        }
      }

      // SECURITY: Additional check for reasonable name format
      const trimmedName = name.trim();
      const nameParts = trimmedName.split(/\s+/);

      // Allow 1-4 name parts (e.g., "John", "Mary Jane", "Mary Jane Smith", "Mary Jane Smith Johnson")
      if (nameParts.length > 4) {
        return {
          success: false,
          error: "Name can have maximum 4 parts (first, middle, last names).",
        };
      }

      // Each name part should be at least 1 character
      if (nameParts.some((part) => part.length < 1)) {
        return {
          success: false,
          error: "Each name part must contain at least one letter.",
        };
      }

      await db
        .update(users)
        .set({ name, updatedAt: new Date() })
        .where(eq(users.id, user.id));

      // Revalidate the account page to show updated data
      revalidatePath("/account");

      return {
        success: true,
        message: "Profile updated successfully",
      };
    } catch (error) {
      const errorResult = handleSecureActionError(error);
      return {
        success: false,
        error: errorResult.error,
      };
    }
  }
);

/**
 * Get user information
 * Returns user profile data
 * /account
 */
export async function getUserProfileAction() {
  try {
    // Require authentication and get full user data (both Supabase and Drizzle)
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    const [userProfile] = await db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        avatar: users.avatar,
        type: users.type,
        role: users.role,
        oauth: users.oauth,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .where(eq(users.id, currentUser.id))
      .limit(1);

    if (!userProfile) {
      return {
        success: false,
        error: "User profile not found",
      };
    }

    // Combine Drizzle data with Supabase auth data (including last_sign_in_at)
    const userActivityData = {
      ...userProfile,
      lastSignInAt: currentUser.last_sign_in_at || null,
      emailConfirmedAt: currentUser.email_confirmed_at || null,
    };

    return {
      success: true,
      user: userActivityData,
    };
  } catch (error) {
    console.error("Get user profile error:", error);
    return {
      success: false,
      error: "Failed to load profile. Please try again.",
    };
  }
}

/**
 * Get user dashboard statistics
 * Returns total stars, joined date, and recent starred posts
 */
export async function getUserDashboardStatsAction() {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      redirect("/signin");
    }
    const user = currentUser.userData;

    const [starCountResult, recentStarRows] = await Promise.all([
      db
        .select({ count: sql<number>`count(*)::int` })
        .from(stars)
        .where(eq(stars.userId, user.id)),
      db
        .select({ id: stars.id, postId: stars.postId, createdAt: stars.createdAt })
        .from(stars)
        .where(eq(stars.userId, user.id))
        .orderBy(desc(stars.createdAt))
        .limit(5),
    ]);
    const totalStars = starCountResult[0]?.count ?? 0;

    // Batch-fetch post details for recent stars
    const starPostIds = recentStarRows.map((r) => r.postId);
    let recentStars: {
      id: string;
      createdAt: Date;
      post: {
        id: string;
        title: string;
        slug: string;
        description: string | null;
        author: { id: string; name: string | null; email: string; avatar: string | null };
        category: { id: string; name: string; slug: string; parent: { id: string; name: string; slug: string } | null };
      };
    }[] = [];
    if (starPostIds.length > 0) {
      const parentCategory = aliasedTable(categories, "parent_category");
      const postRows = await db
        .select({
          postId: posts.id,
          postTitle: posts.title,
          postSlug: posts.slug,
          postDescription: posts.description,
          authorId: users.id,
          authorName: users.name,
          authorEmail: users.email,
          authorAvatar: users.avatar,
          catId: categories.id,
          catName: categories.name,
          catSlug: categories.slug,
          parentCatId: parentCategory.id,
          parentCatName: parentCategory.name,
          parentCatSlug: parentCategory.slug,
        })
        .from(posts)
        .leftJoin(users, eq(posts.authorId, users.id))
        .leftJoin(categories, eq(posts.categoryId, categories.id))
        .leftJoin(parentCategory, eq(categories.parentId, parentCategory.id))
        .where(inArray(posts.id, starPostIds));

      const postMap = new Map(postRows.map((r) => [r.postId, r]));
      recentStars = recentStarRows
        .map((s) => {
          const r = postMap.get(s.postId);
          if (!r) return null;
          return {
            id: s.id,
            createdAt: s.createdAt,
            post: {
              id: r.postId,
              title: r.postTitle,
              slug: r.postSlug,
              description: r.postDescription,
              author: {
                id: r.authorId ?? "",
                name: r.authorName,
                email: r.authorEmail ?? "",
                avatar: r.authorAvatar,
              },
              category: {
                id: r.catId ?? "",
                name: r.catName ?? "",
                slug: r.catSlug ?? "",
                parent: r.parentCatId
                  ? { id: r.parentCatId, name: r.parentCatName ?? "", slug: r.parentCatSlug ?? "" }
                  : null,
              },
            },
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);
    }

    return {
      success: true,
      data: {
        totalStars,
        joinedDate: user.createdAt,
        recentStars,
        userInfo: {
          name: user.name,
          email: user.email,
          avatar: user.avatar,
          type: user.type,
          role: user.role,
        },
      },
    };
  } catch (error) {
    if (error && typeof error === "object" && "digest" in error) {
      const errorDigest = (error as { digest?: string }).digest;
      if (typeof errorDigest === "string" && errorDigest.includes("NEXT_REDIRECT")) {
        throw error;
      }
    }
    console.error("Error fetching user dashboard stats:", error);
    return {
      success: false,
      error: "Failed to fetch user dashboard statistics",
    };
  }
}

/**
 * Get comprehensive admin dashboard statistics
 * Returns total counts and growth percentages for posts, users, categories, and tags
 */
/**
 * Get all users with their activity data for admin dashboard
 * Returns comprehensive user information including registration, posts, and last login
 */
export async function getAllUsersActivityAction() {
  try {
    // Require authentication and check admin role
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    // Check if user is admin
    if (currentUser.userData.role !== "ADMIN") {
      return {
        success: false,
        error: "Admin access required",
      };
    }

    const userRows = await db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        type: users.type,
        role: users.role,
        oauth: users.oauth,
        disabled: users.disabled,
        createdAt: users.createdAt,
        updatedAt: users.updatedAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    const userIds = userRows.map((u) => u.id);
    const [postCounts, starCounts] = await Promise.all([
      db
        .select({ authorId: posts.authorId, count: sql<number>`count(*)::int` })
        .from(posts)
        .where(eq(posts.isPublished, true))
        .groupBy(posts.authorId),
      db
        .select({ userId: stars.userId, count: sql<number>`count(*)::int` })
        .from(stars)
        .groupBy(stars.userId),
    ]);
    const postsByUser = new Map(postCounts.map((r) => [r.authorId, r.count ?? 0]));
    const starsByUser = new Map(starCounts.map((r) => [r.userId, r.count ?? 0]));
    const usersWithCounts = userRows.map((u) => ({
      ...u,
      _count: {
        posts: postsByUser.get(u.id) ?? 0,
        stars: starsByUser.get(u.id) ?? 0,
      },
    }));

    const supabase = await createClient();

    const usersWithLastLogin = await Promise.all(
      usersWithCounts.map(async (user) => {
        try {
          // Get user data from Supabase auth using the user ID
          const { data: authUser } = await supabase.auth.getUser(user.id);

          return {
            ...user,
            lastSignInAt: authUser?.user?.last_sign_in_at || null,
          };
        } catch (error) {
          console.warn(`Failed to fetch auth data for user ${user.id}:`, error);
          return {
            ...user,
            lastSignInAt: null,
          };
        }
      })
    );

    const usersActivity = usersWithLastLogin.map((user: (typeof usersWithCounts)[number] & { lastSignInAt: string | null }, index: number) => ({
      id: index + 1,
      userId: user.id,
      name: user.name || "Unnamed User",
      email: user.email,
      role: user.role,
      userType: user.type,
      provider: user.oauth,
      disabled: user.disabled,
      registeredOn: user.createdAt,
      posts: user._count.posts,
      lastLogin: user.lastSignInAt ? new Date(user.lastSignInAt) : null,
      stars: user._count.stars,
    }));

    return {
      success: true,
      users: usersActivity,
    };
  } catch (error) {
    console.error("Get all users activity error:", error);
    return {
      success: false,
      error: "Failed to load user activity data. Please try again.",
    };
  }
}

export async function getAdminDashboardStatsAction() {
  try {
    // Require authentication and check admin role
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return {
        success: false,
        error: "User not authenticated",
      };
    }

    // Check if user is admin
    if (currentUser.userData.role !== "ADMIN") {
      return {
        success: false,
        error: "Admin access required",
      };
    }

    const now = new Date();
    const t30 = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const t60 = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString();

    // Conditional aggregation: 12 COUNT queries → 4 (one per table)
    const [
      postStats,
      userStats,
      catStats,
      tagStats,
      starCountRow,
      categoryCountRows,
      recentRows,
    ] = await Promise.all([
      db
        .select({
          total: sql<number>`count(*) FILTER (WHERE ${posts.isPublished} = true)::int`,
          thisMonth: sql<number>`count(*) FILTER (WHERE ${posts.isPublished} = true AND ${posts.createdAt} >= ${t30}::timestamptz)::int`,
          prevMonth: sql<number>`count(*) FILTER (WHERE ${posts.isPublished} = true AND ${posts.createdAt} >= ${t60}::timestamptz AND ${posts.createdAt} < ${t30}::timestamptz)::int`,
        })
        .from(posts),
      db
        .select({
          total: sql<number>`count(*)::int`,
          thisMonth: sql<number>`count(*) FILTER (WHERE ${users.createdAt} >= ${t30}::timestamptz)::int`,
          prevMonth: sql<number>`count(*) FILTER (WHERE ${users.createdAt} >= ${t60}::timestamptz AND ${users.createdAt} < ${t30}::timestamptz)::int`,
        })
        .from(users),
      db
        .select({
          total: sql<number>`count(*)::int`,
          thisMonth: sql<number>`count(*) FILTER (WHERE ${categories.createdAt} >= ${t30}::timestamptz)::int`,
          prevMonth: sql<number>`count(*) FILTER (WHERE ${categories.createdAt} >= ${t60}::timestamptz AND ${categories.createdAt} < ${t30}::timestamptz)::int`,
        })
        .from(categories),
      db
        .select({
          total: sql<number>`count(*)::int`,
          thisMonth: sql<number>`count(*) FILTER (WHERE ${tags.createdAt} >= ${t30}::timestamptz)::int`,
          prevMonth: sql<number>`count(*) FILTER (WHERE ${tags.createdAt} >= ${t60}::timestamptz AND ${tags.createdAt} < ${t30}::timestamptz)::int`,
        })
        .from(tags),
      db.select({ count: sql<number>`count(*)::int` }).from(stars),
      db
        .select({
          id: categories.id,
          name: categories.name,
          count: sql<number>`count(*)::int`.as("count"),
        })
        .from(categories)
        .innerJoin(posts, and(eq(posts.categoryId, categories.id), eq(posts.isPublished, true)))
        .groupBy(categories.id, categories.name)
        .orderBy(desc(sql`count(*)`))
        .limit(3),
      db
        .select({
          id: posts.id,
          title: posts.title,
          createdAt: posts.createdAt,
          authorName: users.name,
        })
        .from(posts)
        .innerJoin(users, eq(posts.authorId, users.id))
        .where(eq(posts.isPublished, true))
        .orderBy(desc(posts.createdAt))
        .limit(5),
    ]);

    const ps = postStats[0] ?? { total: 0, thisMonth: 0, prevMonth: 0 };
    const us = userStats[0] ?? { total: 0, thisMonth: 0, prevMonth: 0 };
    const cs = catStats[0] ?? { total: 0, thisMonth: 0, prevMonth: 0 };
    const ts = tagStats[0] ?? { total: 0, thisMonth: 0, prevMonth: 0 };

    const calculateGrowthPercentage = (current: number, previous: number) => {
      if (previous === 0) return current > 0 ? 100 : 0;
      return Math.round(((current - previous) / previous) * 100 * 100) / 100;
    };

    const postsGrowth = calculateGrowthPercentage(ps.thisMonth, ps.prevMonth);
    const usersGrowth = calculateGrowthPercentage(us.thisMonth, us.prevMonth);
    const categoriesGrowth = calculateGrowthPercentage(cs.thisMonth, cs.prevMonth);
    const tagsGrowth = calculateGrowthPercentage(ts.thisMonth, ts.prevMonth);

    const totalStars = starCountRow[0]?.count ?? 0;
    const popularCategories = categoryCountRows.map((r) => ({
      id: r.id,
      name: r.name,
      _count: { posts: r.count ?? 0 },
    }));
    const recentActivity = recentRows.map((r) => ({
      id: r.id,
      title: r.title,
      createdAt: r.createdAt,
      author: { name: r.authorName },
    }));

    return {
      success: true,
      data: {
        // Main statistics
        posts: {
          total: ps.total,
          newThisMonth: ps.thisMonth,
          growthPercentage: postsGrowth,
        },
        users: {
          total: us.total,
          newThisMonth: us.thisMonth,
          growthPercentage: usersGrowth,
        },
        categories: {
          total: cs.total,
          newThisMonth: cs.thisMonth,
          growthPercentage: categoriesGrowth,
        },
        tags: {
          total: ts.total,
          newThisMonth: ts.thisMonth,
          growthPercentage: tagsGrowth,
        },

        engagement: {
          totalStars,
        },
        popularCategories,
        recentActivity,
      },
    };
  } catch (error) {
    console.error("Get admin dashboard stats error:", error);
    return {
      success: false,
      error: "Failed to load dashboard statistics. Please try again.",
    };
  }
}

/**
 * Toggle the disabled status of a user (admin only).
 * Prevents an admin from disabling themselves.
 */
export async function toggleUserDisabledAction(targetUserId: string) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return { success: false, error: "User not authenticated" };
    }

    if (currentUser.userData.role !== "ADMIN") {
      return { success: false, error: "Admin access required" };
    }

    if (currentUser.id === targetUserId) {
      return { success: false, error: "You cannot disable your own account" };
    }

    const [targetUser] = await db
      .select({ id: users.id, disabled: users.disabled })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    const newDisabledState = !targetUser.disabled;

    await db
      .update(users)
      .set({ disabled: newDisabledState, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    revalidatePath("/users");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: newDisabledState
        ? "User has been disabled"
        : "User has been enabled",
      disabled: newDisabledState,
    };
  } catch (error) {
    console.error("Toggle user disabled error:", error);
    return {
      success: false,
      error: "Failed to update user status. Please try again.",
    };
  }
}

/**
 * Change the role of a user (admin only).
 * Only ADMINs can promote a USER to ADMIN or demote an ADMIN to USER.
 * An admin cannot change their own role.
 */
export async function changeUserRoleAction(
  targetUserId: string,
  newRole: "USER" | "ADMIN"
) {
  try {
    const currentUser = await getCurrentUser();
    if (!currentUser?.userData) {
      return { success: false, error: "User not authenticated" };
    }

    if (currentUser.userData.role !== "ADMIN") {
      return { success: false, error: "Admin access required" };
    }

    if (currentUser.id === targetUserId) {
      return { success: false, error: "You cannot change your own role" };
    }

    if (newRole !== "USER" && newRole !== "ADMIN") {
      return { success: false, error: "Invalid role specified" };
    }

    const [targetUser] = await db
      .select({ id: users.id, role: users.role })
      .from(users)
      .where(eq(users.id, targetUserId))
      .limit(1);

    if (!targetUser) {
      return { success: false, error: "User not found" };
    }

    if (targetUser.role === newRole) {
      return { success: false, error: `User already has the ${newRole} role` };
    }

    if (targetUser.role === "ADMIN" && newRole === "USER") {
      return { success: false, error: "You cannot demote another admin" };
    }

    await db
      .update(users)
      .set({ role: newRole, updatedAt: new Date() })
      .where(eq(users.id, targetUserId));

    revalidatePath("/users");
    revalidatePath("/dashboard");

    return {
      success: true,
      message: `User role changed to ${newRole}`,
      role: newRole,
    };
  } catch (error) {
    console.error("Change user role error:", error);
    return {
      success: false,
      error: "Failed to change user role. Please try again.",
    };
  }
}
