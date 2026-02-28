import { defineCollection, z } from 'astro:content';
import { glob } from 'astro/loaders';

const blog = defineCollection({
  // Use a glob loader to find all markdown files in src/content/blog
  loader: glob({ pattern: "**/*.md", base: "./src/content/blog" }),
  // Define the schema for validation
  schema: z.object({
    title: z.string(),
    description: z.string(),
    pubDate: z.date(),
    author: z.string().optional(),
    image: z.string().optional(),
  }),
});

export const collections = { blog };
