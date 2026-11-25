import {sql} from 'drizzle-orm';
import {sqliteTable,text,integer,check,index} from 'drizzle-orm/sqlite-core';
export const catalogOwner=sqliteTable('catalog_owner',{
 id:integer('id').primaryKey(),
 userId:text('user_id').notNull(),
 createdAt:text('created_at').notNull()
},()=>[check('one_owner',sql.raw('"id" = 1'))]);
export const catalogEdits=sqliteTable('catalog_edits',{
 productId:text('product_id').primaryKey(),
 section:text('section'),
 category:text('category'),
 rating:integer('rating').notNull().default(50),
 bottom:integer('bottom').notNull().default(0),
 simp:integer('simp').notNull().default(0),
 reactionMask:integer('reaction_mask').notNull().default(0),
 revision:integer('revision').notNull().default(1),
 updatedAt:text('updated_at').notNull(),
 updatedBy:text('updated_by').notNull()
},()=>[check('rating_range',sql.raw('"rating" >= 0 AND "rating" <= 100')),check('category_pair',sql.raw('("section" IS NULL AND "category" IS NULL) OR ("section" IS NOT NULL AND "category" IS NOT NULL)'))]);
export const githubOwnerSessions=sqliteTable('github_owner_sessions',{
 tokenHash:text('token_hash').primaryKey(),
 ownerId:text('owner_id').notNull(),
 expiresAt:integer('expires_at').notNull(),
},table=>[index('github_owner_sessions_expires_idx').on(table.expiresAt)]);
