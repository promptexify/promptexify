import { relations } from "drizzle-orm/relations";
import { posts, users, categories, bookmarks, postToTag, tags } from "./schema";

export const postsRelations = relations(posts, ({one, many}) => ({
	bookmarks: many(bookmarks),
	user: one(users, {
		fields: [posts.authorId],
		references: [users.id]
	}),
	category: one(categories, {
		fields: [posts.categoryId],
		references: [categories.id]
	}),
	postToTags: many(postToTag),
}));

export const usersRelations = relations(users, ({many}) => ({
	bookmarks: many(bookmarks),
	posts: many(posts),
}));

export const categoriesRelations = relations(categories, ({one, many}) => ({
	category: one(categories, {
		fields: [categories.parentId],
		references: [categories.id],
		relationName: "categories_parentId_categories_id"
	}),
	categories: many(categories, {
		relationName: "categories_parentId_categories_id"
	}),
	posts: many(posts),
}));

export const bookmarksRelations = relations(bookmarks, ({one}) => ({
	post: one(posts, {
		fields: [bookmarks.postId],
		references: [posts.id]
	}),
	user: one(users, {
		fields: [bookmarks.userId],
		references: [users.id]
	}),
}));

export const postToTagRelations = relations(postToTag, ({one}) => ({
	post: one(posts, {
		fields: [postToTag.a],
		references: [posts.id]
	}),
	tag: one(tags, {
		fields: [postToTag.b],
		references: [tags.id]
	}),
}));

export const tagsRelations = relations(tags, ({many}) => ({
	postToTags: many(postToTag),
}));
