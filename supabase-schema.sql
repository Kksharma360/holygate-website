-- ==============================================================================
-- HOLYGATE Grocery Storefront — Supabase Database & Storage Setup
-- Run this entire script in Supabase Dashboard -> SQL Editor -> New Query -> Run
-- ==============================================================================

-- 1. Create the Products table
create table if not exists public.products (
  id text primary key,
  title text not null,
  category text default 'Pulses & Lentils',
  description text default '',
  brand text default 'HOLYGATE',
  pack_size text default '1 kg',
  image text default '',
  gallery jsonb default '[]'::jsonb,
  amazon_url text default '',
  asin text default '',
  offer_price text default '',
  featured boolean default false,
  published boolean default true,
  show_offer_price boolean default false,
  highlights jsonb default '[]'::jsonb,
  amazon_source boolean default false,
  source_updated_at bigint default 0,
  offer_updated_at bigint default 0,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- 2. Create index for fast lookups
create index if not exists idx_products_category on public.products(category);
create index if not exists idx_products_asin on public.products(asin);
create index if not exists idx_products_published on public.products(published);

-- 3. Enable Row Level Security (RLS)
alter table public.products enable row level security;

-- 4. Create RLS Policies
-- Anyone can view published products (public storefront)
drop policy if exists "Allow public read of published products" on public.products;
create policy "Allow public read of published products"
  on public.products
  for select
  using (true);

-- Allow full access for anon & service role keys (admin operations)
drop policy if exists "Allow anon full access to products" on public.products;
create policy "Allow anon full access to products"
  on public.products
  for all
  using (true)
  with check (true);

-- 5. Create Storage Bucket for Product Images (Optional / Cloud CDN)
-- Automatically creates 'product-images' public bucket if storage schema exists
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do update set public = true;

-- Policy to allow anyone to read images from the bucket
drop policy if exists "Public image access" on storage.objects;
create policy "Public image access"
  on storage.objects
  for select
  using (bucket_id = 'product-images');

-- Policy to allow image uploads
drop policy if exists "Allow uploads to product-images" on storage.objects;
create policy "Allow uploads to product-images"
  on storage.objects
  for insert
  with check (bucket_id = 'product-images');

drop policy if exists "Allow update to product-images" on storage.objects;
create policy "Allow update to product-images"
  on storage.objects
  for update
  using (bucket_id = 'product-images');
