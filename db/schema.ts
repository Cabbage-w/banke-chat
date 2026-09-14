import { sqliteTable, text, integer, primaryKey, index } from "drizzle-orm/sqlite-core";
export const profiles = sqliteTable("profiles", { id: text("id").primaryKey(), name: text("name").notNull() });
export const rooms = sqliteTable("rooms", { id: text("id").primaryKey(), name: text("name").notNull(), description: text("description").notNull(), owner: text("owner").notNull(), token: text("token").notNull().unique(), created: integer("created").notNull() });
export const members = sqliteTable("members", { room: text("room").notNull().references(() => rooms.id), user: text("user").notNull().references(() => profiles.id), joined: integer("joined").notNull() }, t => [primaryKey({columns:[t.room,t.user]}), index("idx_members_user").on(t.user)]);
export const messages = sqliteTable("messages", { seq: integer("seq").primaryKey({autoIncrement:true}), id: text("id").notNull().unique(), room: text("room").notNull().references(() => rooms.id), user: text("user").notNull().references(() => profiles.id), body: text("body").notNull(), created: integer("created").notNull() }, t => [index("idx_messages_room_seq").on(t.room,t.seq)]);

