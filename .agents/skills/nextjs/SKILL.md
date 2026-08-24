---
name: nextjs
description: >-
  Use this skill when building or configuring Next.js web applications, managing
  App Router routes, server components, API routes, or SEO settings.
---

# Next.js App Router Guidelines

Use this skill when developing Next.js projects using the App Router. This guide defines how to structure Server vs. Client Components, handle data fetching/caching, implement routing, and optimize SEO and core web vitals.

## Server vs. Client Components

Next.js App Router uses Server Components by default. Keep component trees server-rendered as much as possible for fast loading times and reduced client bundles.

| Feature / Action | Server Component | Client Component (`'use use client'`) |
| :--- | :---: | :---: |
| Data fetching (direct DB/API access) | **Yes** | No |
| Access backend resources directly | **Yes** | No |
| Keep sensitive keys secure | **Yes** | No |
| Large dependencies (server-only) | **Yes** | No |
| Interactivity (onClick, onChange) | No | **Yes** |
| State and Effects (`useState`, `useEffect`) | No | **Yes** |
| Browser-only APIs (localStorage, window) | No | **Yes** |

### Guidelines
- Move client-side logic to leaf components.
- Wrap third-party client providers in layout client components.

---

## Data Fetching, Caching, and Server Actions

1. **Direct Data Fetching in Server Components**:
   ```typescript
   // app/products/page.tsx
   import React from 'react';

   interface Product {
     id: string;
     name: string;
     price: number;
   }

   async function getProducts(): Promise<Product[]> {
     const res = await fetch('https://api.example.com/products', {
       next: { revalidate: 3600 }, // Cache response for 1 hour
     });
     if (!res.ok) throw new Error('Failed to fetch products');
     return res.json();
   }

   export default async function ProductsPage() {
     const products = await getProducts();
     return (
       <main className="p-8">
         <h1 className="text-3xl font-bold mb-4">Products</h1>
         <ul>
           {products.map((p) => (
             <li key={p.id} className="py-2">{p.name} - ${p.price}</li>
           ))}
         </ul>
       </main>
     );
   }
   ```

2. **Server Actions (for forms and state modification)**:
   ```typescript
   // app/actions.ts
   'use server';

   import { revalidatePath } from 'next/cache';

   export async function createItem(formData: FormData) {
     const name = formData.get('name');
     // Perform database insertion here...
     console.log(`Created item: ${name}`);
     
     revalidatePath('/items');
   }
   ```

---

## SEO & Web Vitals Optimization

1. **Static Metadata**:
   ```typescript
   import type { Metadata } from 'next';

   export const metadata: Metadata = {
     title: 'Epic Slap Game | Ultimate Arcade Fun',
     description: 'Compete in the wildest slap match in this high-intensity 3D arcade experience.',
     openGraph: {
       title: 'Epic Slap Game',
       description: 'The ultimate physics-based slap game.',
       images: ['/og-image.jpg'],
     },
   };
   ```

2. **Dynamic Metadata (for item pages)**:
   ```typescript
   export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
     const product = await fetchProduct(params.id);
     return {
       title: `${product.name} - Epic Slap Store`,
       description: product.description,
     };
   }
   ```

3. **Core Vitals**:
   - Use `next/image` to prevent Layout Shift (CLS) and serve optimized WebP formats.
   - Use `next/font` to load Google Fonts without runtime network overhead.
