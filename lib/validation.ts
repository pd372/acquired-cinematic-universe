import { z } from "zod"

// Entity validation schemas
export const entityTypes = ["Company", "Person", "Topic", "Episode", "Industry", "Location", "Product"] as const

export const createEntitySchema = z.object({
  name: z.string().min(1, "Name is required").max(255, "Name must be less than 255 characters").trim(),
  type: z.enum(entityTypes, {
    errorMap: () => ({ message: `Type must be one of: ${entityTypes.join(", ")}` }),
  }),
  description: z.string().max(5000, "Description must be less than 5000 characters").trim().optional().nullable(),
})

export const updateEntitySchema = z.object({
  name: z.string().min(1, "Name is required").max(255).trim().optional(),
  type: z.enum(entityTypes).optional(),
  description: z.string().max(5000).trim().optional().nullable(),
})

// Connection validation schemas
export const createConnectionSchema = z.object({
  sourceId: z.string().min(1, "Source entity ID is required"),
  targetId: z.string().min(1, "Target entity ID is required"),
  type: z.string().min(1, "Connection type is required").max(100).trim(),
  episodeId: z.string().min(1, "Episode ID is required"),
  context: z.string().max(5000).trim().optional().nullable(),
})

export const updateConnectionSchema = z.object({
  type: z.string().min(1).max(100).trim().optional(),
  context: z.string().max(5000).trim().optional().nullable(),
})

// Auth validation schemas
export const loginSchema = z.object({
  password: z.string().min(1, "Password is required"),
})

// URL validation schema
export const urlSchema = z.object({
  url: z.string().url("Must be a valid URL"),
})

// Pagination schema
export const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

// Export type helpers
export type CreateEntityInput = z.infer<typeof createEntitySchema>
export type UpdateEntityInput = z.infer<typeof updateEntitySchema>
export type CreateConnectionInput = z.infer<typeof createConnectionSchema>
export type UpdateConnectionInput = z.infer<typeof updateConnectionSchema>
export type LoginInput = z.infer<typeof loginSchema>
