// Re-export all actions from their respective modules

// Authentication actions
export {
  signInAction,
  signUpAction,
  magicLinkAction,
  oauthAction,
  signOutAction,
} from "./auth";

// Star (save) actions
export {
  toggleStarAction,
  getUserStarsAction,
  checkStarStatusAction,
} from "./stars";

// Post management actions
export {
  createPostAction,
  updatePostAction,
  togglePostPublishAction,
  deletePostAction,
  approvePostAction,
  rejectPostAction,
  cleanupOrphanedMediaAction,
} from "./posts";

// Category management actions
export {
  createCategoryAction,
  updateCategoryAction,
  deleteCategoryAction,
} from "./categories";

// Tag management actions
export { createTagAction, updateTagAction, deleteTagAction } from "./tags";

// Automation actions
export * from "./automation";

// User profile actions
export {
  updateUserProfileAction,
  getUserProfileAction,
  getUserDashboardStatsAction,
  getAdminDashboardStatsAction,
  getAllUsersActivityAction,
  toggleUserDisabledAction,
  changeUserRoleAction,
} from "./users";

// Settings actions
export {
  getSettingsAction,
  updateSettingsAction,
  getStorageConfigAction,
  resetSettingsToDefaultAction,
  clearMediaCachesAction,
} from "./settings";
